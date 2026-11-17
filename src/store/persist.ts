import { sanitizeKey } from '../data/keys';
import { ProviderMode } from '../data/types';
import { Account, Order, OrderStatus, OrderType, Position, Side } from './orders';

const MAX_JSON_BYTES = 500_000;
const MAX_ORDERS = 500;
const MAX_WATCHLIST = 100;
const MAX_SYMBOL_LEN = 16;
const SYM_RE = /^[A-Za-z0-9._-]{1,16}$/;

export interface Settings {
  provider: ProviderMode;
  apiKey: string;
}

export interface Persisted {
  account: Account;
  watchlist: string[];
  settings: Settings;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function cleanSymbol(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toUpperCase();
  if (!SYM_RE.test(s)) return undefined;
  return s;
}

const SIDES: Side[] = ['buy', 'sell'];
const TYPES: OrderType[] = ['market', 'limit'];
const STATUSES: OrderStatus[] = ['open', 'filled', 'cancelled', 'rejected'];

function cleanPosition(v: unknown): Position | undefined {
  if (!isObj(v)) return undefined;
  const qty = finite(v.qty);
  const avgCost = finite(v.avgCost);
  if (qty == null || qty <= 0 || qty > 1e12) return undefined;
  if (avgCost == null || avgCost < 0 || avgCost > 1e12) return undefined;
  return { qty, avgCost };
}

function cleanOrder(v: unknown): Order | undefined {
  if (!isObj(v)) return undefined;
  const symbol = cleanSymbol(v.symbol);
  const side = v.side;
  const type = v.type;
  const status = v.status;
  const qty = finite(v.qty);
  const createdAt = finite(v.createdAt) ?? 0;
  if (!symbol || qty == null || qty <= 0) return undefined;
  if (side !== 'buy' && side !== 'sell') return undefined;
  if (type !== 'market' && type !== 'limit') return undefined;
  if (!STATUSES.includes(status as OrderStatus)) return undefined;
  const limitPrice = finite(v.limitPrice);
  const filledAt = finite(v.filledAt);
  const fillPrice = finite(v.fillPrice);
  const reason = typeof v.reason === 'string' ? v.reason.slice(0, 300) : undefined;
  const id = typeof v.id === 'string' && v.id.length <= 80 ? v.id : `rec-${createdAt}`;
  void SIDES; void TYPES;
  const o: Order = { id, symbol, side, type, qty, status: status as OrderStatus, createdAt };
  if (type === 'limit' && limitPrice != null && limitPrice > 0) o.limitPrice = limitPrice;
  if (filledAt != null) o.filledAt = filledAt;
  if (fillPrice != null) o.fillPrice = fillPrice;
  if (reason) o.reason = reason;
  return o;
}

function cleanAccount(v: unknown, fallback: Account): Account {
  if (!isObj(v)) return fallback;
  const cash = finite(v.cash);
  if (cash == null || cash < -1e-6 || cash > 1e12) return fallback;
  const positions: Record<string, Position> = {};
  if (isObj(v.positions)) {
    for (const [k, pos] of Object.entries(v.positions)) {
      const sym = cleanSymbol(k);
      const p = cleanPosition(pos);
      if (sym && p) positions[sym] = p;
    }
  }
  const orders: Order[] = [];
  if (Array.isArray(v.orders)) {
    for (const item of v.orders.slice(0, MAX_ORDERS)) {
      const o = cleanOrder(item);
      if (o) orders.push(o);
    }
  }
  return { cash, positions, orders };
}

function cleanWatchlist(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v.slice(0, MAX_WATCHLIST)) {
    const s = cleanSymbol(item);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function cleanSettings(v: unknown, fallback: Settings): Settings {
  if (!isObj(v)) return fallback;
  const provider: ProviderMode = v.provider === 'live' ? 'live' : v.provider === 'mock' ? 'mock' : fallback.provider;
  const apiKey = sanitizeKey(v.apiKey) || (typeof v.apiKey === 'string' ? sanitizeKey(String(v.apiKey).slice(0, 200)) : '');
  return { provider, apiKey };
}

/**
 * Parse and sanitize persisted app state. Invalid or oversized payloads fall back
 * to the provided defaults (or to the valid parts when possible).
 */
export function parsePersisted(raw: string, defaults: Persisted): Persisted {
  if (typeof raw !== 'string' || raw.length > MAX_JSON_BYTES) return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (!isObj(parsed)) return defaults;
  // Pick fields explicitly — never Object.assign the parsed object.
  return {
    account: cleanAccount(parsed.account, defaults.account),
    watchlist: cleanWatchlist(parsed.watchlist, defaults.watchlist),
    settings: cleanSettings(parsed.settings, defaults.settings),
  };
}

export { MAX_SYMBOL_LEN, SYM_RE };
