import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createProvider, MarketDataProvider, ProviderMode, Quote } from '../data';
import { ENV_API_KEY, ENV_PROVIDER, STARTING_CASH } from '../data/config';
import { DEFAULT_WATCHLIST, UNIVERSE } from '../data/symbols';
import { fmtMoney, fmtQty } from '../utils/format';
import {
  Account, cancelOrder, createAccount, Order, OrderRequest, placeOrder, processOpenOrders,
} from './orders';

const STORAGE_KEY = 'tradingapp:v1';

export interface Settings {
  provider: ProviderMode;
  apiKey: string;
}

interface Persisted {
  account: Account;
  watchlist: string[];
  settings: Settings;
}

interface AppState {
  ready: boolean;
  account: Account;
  watchlist: string[];
  settings: Settings;
  quotes: Record<string, Quote>;
  provider: MarketDataProvider;
  notice: string | null;
  submitOrder: (req: OrderRequest) => { order: Order; error: string | null };
  cancel: (id: string) => void;
  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  resetAccount: () => void;
  dismissNotice: () => void;
}

const Ctx = createContext<AppState | null>(null);

const defaults = (): Persisted => ({
  account: createAccount(STARTING_CASH),
  watchlist: [...DEFAULT_WATCHLIST],
  settings: { provider: ENV_PROVIDER, apiKey: ENV_API_KEY },
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<Persisted>(defaults);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;

  const stateRef = useRef(state);
  stateRef.current = state;

  // Load persisted state once.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const p = JSON.parse(raw) as Partial<Persisted>;
          const d = defaults();
          setState({
            account: p.account ?? d.account,
            watchlist: p.watchlist ?? d.watchlist,
            settings: { ...d.settings, ...(p.settings ?? {}) },
          });
        }
      })
      .catch((e) => console.warn('Failed to load state', e))
      .finally(() => setReady(true));
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) => console.warn('Failed to save state', e));
  }, [state, ready]);

  const provider = useMemo(
    () => createProvider(state.settings.provider, state.settings.apiKey),
    [state.settings.provider, state.settings.apiKey],
  );

  // Stream quotes for the whole universe; fill resting limit orders as prices move.
  useEffect(() => {
    const unsub = provider.subscribe(UNIVERSE.map((s) => s.symbol), (qs) => {
      setQuotes((prev) => {
        const next = { ...prev };
        qs.forEach((q) => (next[q.symbol] = q));
        return next;
      });
      const prices: Record<string, number> = {};
      qs.forEach((q) => (prices[q.symbol] = q.price));
      const s = stateRef.current;
      if (!s.account.orders.some((o) => o.status === 'open')) return;
      const { account, filled } = processOpenOrders(s.account, prices);
      if (!filled.length && account.orders.every((o, i) => o === s.account.orders[i])) return;
      if (filled.length) {
        const f = filled[0];
        setNotice(`Limit ${f.side} filled: ${fmtQty(f.qty)} ${f.symbol} @ ${fmtMoney(f.fillPrice ?? 0)}`);
      }
      const next = { ...s, account };
      stateRef.current = next;
      setState(next);
    });
    return unsub;
  }, [provider]);

  const submitOrder = useCallback((req: OrderRequest) => {
    const price = quotesRef.current[req.symbol]?.price ?? NaN;
    const res = placeOrder(stateRef.current.account, req, price);
    const next = { ...stateRef.current, account: res.account };
    stateRef.current = next;
    setState(next);
    return { order: res.order, error: res.error };
  }, []);

  const value: AppState = {
    ready,
    account: state.account,
    watchlist: state.watchlist,
    settings: state.settings,
    quotes,
    provider,
    notice,
    submitOrder,
    cancel: (id) => setState((s) => ({ ...s, account: cancelOrder(s.account, id) })),
    addToWatchlist: (sym) =>
      setState((s) => (s.watchlist.includes(sym) ? s : { ...s, watchlist: [...s.watchlist, sym] })),
    removeFromWatchlist: (sym) => setState((s) => ({ ...s, watchlist: s.watchlist.filter((x) => x !== sym) })),
    updateSettings: (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    resetAccount: () => setState((s) => ({ ...s, account: createAccount(STARTING_CASH), watchlist: [...DEFAULT_WATCHLIST] })),
    dismissNotice: () => setNotice(null),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}
