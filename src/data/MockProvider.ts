import { getSymbolInfo, UNIVERSE } from './symbols';
import { gaussian, hashString, mulberry32 } from './random';
import { Candle, DataStatus, MarketDataProvider, Quote, QuoteListener, Timeframe } from './types';

interface SymState {
  price: number;
  prevClose: number;
  base: number;
  vol: number; // per-tick log-volatility
  rand: () => number;
}

export interface MockProviderOptions {
  seed?: number;
  tickMs?: number;
  now?: () => number;
}

const TF_SPEC: Record<Timeframe, { points: number; stepMs: number }> = {
  '1D': { points: 96, stepMs: 15 * 60 * 1000 / 4 }, // ~6h of 3.75m bars (intraday session)
  '1W': { points: 140, stepMs: 60 * 60 * 1000 },
  '1M': { points: 120, stepMs: 6 * 60 * 60 * 1000 },
  '1Y': { points: 252, stepMs: 24 * 60 * 60 * 1000 * (365 / 252) },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic random-walk market data. No network, no API key.
 * Prices tick every `tickMs` (default 1.5s) using a seeded PRNG per symbol,
 * so the same seed always yields the same price path.
 */
export class MockProvider implements MarketDataProvider {
  readonly id = 'mock';
  private states = new Map<string, SymState>();
  private listeners = new Set<{ symbols: Set<string>; fn: QuoteListener }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly seed: number;
  private readonly tickMs: number;
  private readonly now: () => number;

  constructor(opts: MockProviderOptions = {}) {
    this.seed = opts.seed ?? 42;
    this.tickMs = opts.tickMs ?? 1500;
    this.now = opts.now ?? (() => Date.now());
  }

  private state(symbol: string): SymState {
    const sym = symbol.toUpperCase();
    let st = this.states.get(sym);
    if (!st) {
      const info = getSymbolInfo(sym);
      const base = info?.basePrice ?? 100;
      const rand = mulberry32(hashString(sym) ^ this.seed);
      // Deterministic opening offset of up to +/-3% from the previous close.
      const open = base * (1 + (rand() - 0.5) * 0.06);
      const vol = info?.type === 'crypto' ? 0.0025 : 0.0012;
      st = { price: open, prevClose: base, base, vol, rand };
      this.states.set(sym, st);
    }
    return st;
  }

  private toQuote(symbol: string, st: SymState): Quote {
    const change = st.price - st.prevClose;
    return {
      symbol: symbol.toUpperCase(),
      price: st.price,
      prevClose: st.prevClose,
      change,
      changePct: (change / st.prevClose) * 100,
      timestamp: this.now(),
      source: 'mock',
      origin: 'mock',
    };
  }

  /** Advance every known symbol one random-walk step. Exposed for tests. */
  tick(): void {
    for (const st of this.states.values()) {
      const g = gaussian(st.rand);
      // Mild mean reversion towards the base price keeps the walk bounded.
      const drift = -0.01 * Math.log(st.price / st.base);
      st.price = st.price * Math.exp(drift + st.vol * g);
    }
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) {
      const quotes = [...l.symbols].map((s) => this.toQuote(s, this.state(s)));
      l.fn(quotes);
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    return this.toQuote(symbol, this.state(symbol));
  }

  /** Deterministic history that ends exactly at the current price. */
  async getHistory(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
    return this.historyEndingAt(symbol, timeframe, this.state(symbol).price);
  }

  historyEndingAt(symbol: string, timeframe: Timeframe, endPrice: number): Candle[] {
    const sym = symbol.toUpperCase();
    const info = getSymbolInfo(sym);
    const { points, stepMs } = TF_SPEC[timeframe];
    const rand = mulberry32(hashString(`${sym}|${timeframe}`) ^ this.seed);
    const dailyVol = info?.type === 'crypto' ? 0.035 : 0.018;
    const stepVol = dailyVol * Math.sqrt(stepMs / DAY_MS);
    const trend = (rand() - 0.45) * stepVol * 0.3; // slight per-series trend
    const now = this.now();
    const out: Candle[] = new Array(points);
    let p = endPrice;
    for (let i = points - 1; i >= 0; i--) {
      out[i] = { t: now - (points - 1 - i) * stepMs, p };
      p = p / Math.exp(trend + stepVol * gaussian(rand));
    }
    return out;
  }

  subscribe(symbols: string[], listener: QuoteListener): () => void {
    const entry = { symbols: new Set(symbols.map((s) => s.toUpperCase())), fn: listener };
    entry.symbols.forEach((s) => this.state(s));
    this.listeners.add(entry);
    // Push an immediate snapshot so the UI is never empty.
    listener([...entry.symbols].map((s) => this.toQuote(s, this.state(s))));
    if (!this.timer) this.timer = setInterval(() => this.tick(), this.tickMs);
    return () => {
      this.listeners.delete(entry);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }


  getStatus(): DataStatus {
    return { mode: 'mock', hasFinnhubKey: false, usingProxy: false, lastError: null, symbolErrors: {} };
  }

  /** Initialise all universe symbols (handy for tests / snapshots). */
  warmUp(): void {
    UNIVERSE.forEach((s) => this.state(s.symbol));
  }
}
