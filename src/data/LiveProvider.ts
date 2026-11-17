import {
  CANDLE_TTL, COINGECKO_RPM, FINNHUB_RPM, QUOTE_TTL_MS, REQUEST_TIMEOUT_MS, STALE_QUOTE_GRACE_MS,
} from './config';
import { FetchLike, HttpError, TokenBucket, TtlCache, fetchJson, redactUrl } from './http';
import { MockProvider } from './MockProvider';
import { getSymbolInfo } from './symbols';
import { Candle, DataStatus, MarketDataProvider, Quote, QuoteListener, Timeframe } from './types';

/**
 * Hybrid live market data:
 *  - Crypto via CoinGecko public API (optional demo key as x-cg-demo-api-key).
 *  - Stocks via Finnhub /quote when a key or a backend proxy is configured.
 * Failures fall back to the last good real quote, then to MockProvider for that symbol.
 */
export interface LiveProviderOptions {
  finnhubKey?: string;
  coinGeckoKey?: string;
  /** Base URL of the optional allowlisted proxy (no trailing slash). */
  proxyUrl?: string;
  fallback?: MockProvider;
  fetchImpl?: FetchLike;
  stockPollMs?: number;
  cryptoPollMs?: number;
  onError?: (err: unknown, context: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  requestTimeoutMs?: number;
}

const CG = 'https://api.coingecko.com/api/v3';
const FH = 'https://finnhub.io/api/v1';

const TF_DAYS: Record<Timeframe, string> = { '1D': '1', '1W': '7', '1M': '30', '1Y': '365' };

function errMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return redactUrl(raw).replace(/(token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=***');
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export class LiveProvider implements MarketDataProvider {
  readonly id = 'live';
  private fallback: MockProvider;
  private fetchImpl: FetchLike;
  private finnhubKey?: string;
  private coinGeckoKey?: string;
  private proxyUrl?: string;
  private stockPollMs: number;
  private cryptoPollMs: number;
  private onError?: (err: unknown, context: string) => void;
  private sleep?: (ms: number) => Promise<void>;
  private now: () => number;
  private timeoutMs: number;
  private lastQuotes = new Map<string, Quote>();
  private lastError: string | null = null;
  private symbolErrors = new Map<string, string>();
  private cache = new TtlCache<unknown>();
  private inflight = new Map<string, Promise<unknown>>();
  private cgBucket = new TokenBucket(COINGECKO_RPM, COINGECKO_RPM / 60_000);
  private fhBucket = new TokenBucket(FINNHUB_RPM, FINNHUB_RPM / 60_000);

  constructor(opts: LiveProviderOptions = {}) {
    this.fallback = opts.fallback ?? new MockProvider();
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.finnhubKey = opts.finnhubKey?.trim() || undefined;
    this.coinGeckoKey = opts.coinGeckoKey?.trim() || undefined;
    this.proxyUrl = opts.proxyUrl?.trim().replace(/\/+$/, '') || undefined;
    this.stockPollMs = opts.stockPollMs ?? 20_000;
    this.cryptoPollMs = opts.cryptoPollMs ?? 30_000;
    this.onError = opts.onError;
    this.sleep = opts.sleep;
    this.now = opts.now ?? (() => Date.now());
    this.timeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  getStatus(): DataStatus {
    const symbolErrors: Record<string, string> = {};
    this.symbolErrors.forEach((v, k) => {
      symbolErrors[k] = v;
    });
    return {
      mode: 'live',
      hasFinnhubKey: Boolean(this.finnhubKey) || Boolean(this.proxyUrl),
      usingProxy: Boolean(this.proxyUrl),
      lastError: this.lastError,
      symbolErrors,
    };
  }

  private noteError(ctx: string, e: unknown, symbol?: string) {
    const msg = errMessage(e);
    this.lastError = `${ctx}: ${msg}`;
    if (symbol) this.symbolErrors.set(symbol, msg);
    this.onError?.(e, ctx);
  }

  private noteSuccess(symbol: string) {
    this.symbolErrors.delete(symbol);
    if (this.symbolErrors.size === 0) this.lastError = null;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { Accept: 'application/json', ...(extra ?? {}) };
  }

  private async json(url: string, kind: 'coingecko' | 'finnhub', cacheTtlMs: number, extraHeaders?: Record<string, string>): Promise<any> {
    return fetchJson({
      url,
      fetchImpl: this.fetchImpl,
      headers: this.headers(extraHeaders),
      timeoutMs: this.timeoutMs,
      bucket: kind === 'coingecko' ? this.cgBucket : this.fhBucket,
      cache: this.cache,
      cacheTtlMs,
      cacheKey: url,
      inflight: this.inflight,
      maxRetries: 3,
      now: this.now,
      sleep: this.sleep,
    });
  }

  private cgHeaders(): Record<string, string> | undefined {
    if (this.proxyUrl || !this.coinGeckoKey) return undefined;
    return { 'x-cg-demo-api-key': this.coinGeckoKey };
  }

  private cgUrl(pathAndQuery: string): string {
    if (this.proxyUrl) return `${this.proxyUrl}/coingecko${pathAndQuery}`;
    return `${CG}${pathAndQuery}`;
  }

  private fhRequest(symbol: string): { url: string; headers?: Record<string, string> } {
    const sym = encodeURIComponent(symbol);
    if (this.proxyUrl) return { url: `${this.proxyUrl}/finnhub/quote?symbol=${sym}` };
    if (!this.finnhubKey) throw new Error('No Finnhub API key configured');
    // Header, not query string, so the token is less likely to appear in logs or Referer.
    return { url: `${FH}/quote?symbol=${sym}`, headers: { 'X-Finnhub-Token': this.finnhubKey } };
  }

  private async cryptoQuotes(symbols: string[]): Promise<Quote[]> {
    const infos = symbols.map((s) => getSymbolInfo(s)).filter((i) => i?.coingeckoId);
    if (!infos.length) return [];
    const ids = infos.map((i) => i!.coingeckoId).join(',');
    const data = await this.json(
      this.cgUrl(`/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`),
      'coingecko',
      QUOTE_TTL_MS,
      this.cgHeaders(),
    );
    if (!data || typeof data !== 'object') throw new Error('CoinGecko: unexpected payload');
    const out: Quote[] = [];
    for (const info of infos) {
      const row = (data as Record<string, { usd?: unknown; usd_24h_change?: unknown }>)[info!.coingeckoId!];
      const price = num(row?.usd);
      if (price == null || price <= 0) continue;
      const pct = num(row?.usd_24h_change) ?? 0;
      const prevClose = price / (1 + pct / 100);
      const q: Quote = {
        symbol: info!.symbol,
        price,
        prevClose,
        change: price - prevClose,
        changePct: pct,
        timestamp: this.now(),
        source: 'coingecko',
        origin: 'real',
      };
      out.push(q);
    }
    return out;
  }

  private async stockQuote(symbol: string): Promise<Quote> {
    const req = this.fhRequest(symbol);
    const d = await this.json(req.url, 'finnhub', QUOTE_TTL_MS, req.headers) as {
      c?: unknown; pc?: unknown; d?: unknown; dp?: unknown; t?: unknown;
    };
    const price = num(d?.c);
    if (price == null || price === 0) throw new Error(`Finnhub: no quote for ${symbol}`);
    const prevClose = num(d?.pc) ?? price;
    const change = num(d?.d) ?? price - prevClose;
    const changePct = num(d?.dp) ?? (prevClose ? (change / prevClose) * 100 : 0);
    const ts = num(d?.t);
    return {
      symbol,
      price,
      prevClose,
      change,
      changePct,
      timestamp: ts && ts > 0 ? ts * 1000 : this.now(),
      source: 'finnhub',
      origin: 'real',
    };
  }

  private staleReal(sym: string): Quote | undefined {
    const q = this.lastQuotes.get(sym);
    if (!q || q.origin !== 'real') return undefined;
    if (this.now() - q.timestamp > STALE_QUOTE_GRACE_MS) return undefined;
    return q;
  }

  private async fallbackQuote(sym: string, e: unknown, ctx: string): Promise<Quote> {
    this.noteError(ctx, e, sym);
    const stale = this.staleReal(sym);
    if (stale) return stale;
    const q = await this.fallback.getQuote(sym);
    return { ...q, origin: 'fallback' };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const sym = symbol.toUpperCase();
    const info = getSymbolInfo(sym);
    try {
      const q = info?.type === 'crypto' ? (await this.cryptoQuotes([sym]))[0] : await this.stockQuote(sym);
      if (!q) throw new Error(`No quote for ${sym}`);
      this.lastQuotes.set(sym, q);
      this.noteSuccess(sym);
      return q;
    } catch (e) {
      return this.fallbackQuote(sym, e, `getQuote ${sym}`);
    }
  }

  async getHistory(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
    const sym = symbol.toUpperCase();
    const info = getSymbolInfo(sym);
    try {
      if (info?.type === 'crypto' && info.coingeckoId) {
        const d = await this.json(
          this.cgUrl(`/coins/${encodeURIComponent(info.coingeckoId)}/market_chart?vs_currency=usd&days=${TF_DAYS[timeframe]}`),
          'coingecko',
          CANDLE_TTL[timeframe],
          this.cgHeaders(),
        ) as { prices?: unknown };
        const raw = Array.isArray(d?.prices) ? d.prices : [];
        const pts: Candle[] = [];
        for (const row of raw) {
          if (!Array.isArray(row) || row.length < 2) continue;
          const t = num(row[0]);
          const p = num(row[1]);
          if (t == null || p == null || p <= 0) continue;
          pts.push({ t, p });
        }
        if (pts.length < 2) throw new Error('empty history');
        pts.sort((a, b) => a.t - b.t);
        const step = Math.max(1, Math.floor(pts.length / 200));
        const sampled = pts.filter((_, i) => i % step === 0);
        if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);
        return sampled;
      }
      // Finnhub candles require a paid plan; synthesize history anchored to the last real price.
      const q = this.lastQuotes.get(sym) ?? (await this.stockQuote(sym));
      return this.fallback.historyEndingAt(sym, timeframe, q.price);
    } catch (e) {
      this.noteError(`getHistory ${sym}`, e, sym);
      const stale = this.staleReal(sym);
      if (stale) return this.fallback.historyEndingAt(sym, timeframe, stale.price);
      return this.fallback.getHistory(sym, timeframe);
    }
  }

  subscribe(symbols: string[], listener: QuoteListener): () => void {
    const syms = symbols.map((s) => s.toUpperCase());
    const crypto = syms.filter((s) => getSymbolInfo(s)?.type === 'crypto');
    const stocks = syms.filter((s) => getSymbolInfo(s)?.type !== 'crypto');
    let active = true;
    const realSeen = new Set<string>();

    const unsubMock = this.fallback.subscribe(syms, (qs) => {
      const missing = qs
        .filter((q) => !realSeen.has(q.symbol))
        .map((q) => ({ ...q, origin: 'fallback' as const }));
      if (missing.length && active) listener(missing);
    });

    const pollCrypto = async () => {
      if (!crypto.length) return;
      try {
        const qs = await this.cryptoQuotes(crypto);
        qs.forEach((q) => {
          realSeen.add(q.symbol);
          this.lastQuotes.set(q.symbol, q);
          this.noteSuccess(q.symbol);
        });
        const failed = crypto.filter((s) => !qs.some((q) => q.symbol === s));
        failed.forEach((s) => {
          if (!this.staleReal(s)) realSeen.delete(s);
        });
        if (active && qs.length) listener(qs);
      } catch (e) {
        this.noteError('poll crypto', e);
        crypto.forEach((s) => {
          if (!this.staleReal(s)) realSeen.delete(s);
        });
      }
    };

    const pollStocks = async () => {
      if (!this.finnhubKey && !this.proxyUrl) return;
      const results = await Promise.allSettled(stocks.map((s) => this.stockQuote(s)));
      const qs: Quote[] = [];
      results.forEach((r, i) => {
        const sym = stocks[i];
        if (r.status === 'fulfilled') {
          qs.push(r.value);
          realSeen.add(r.value.symbol);
          this.lastQuotes.set(r.value.symbol, r.value);
          this.noteSuccess(r.value.symbol);
        } else {
          this.noteError(`poll ${sym}`, r.reason, sym);
          if (!this.staleReal(sym)) realSeen.delete(sym);
        }
      });
      if (active && qs.length) listener(qs);
    };

    if (crypto.length) void pollCrypto();
    if (stocks.length) void pollStocks();
    const t1 = crypto.length ? setInterval(() => void pollCrypto(), this.cryptoPollMs) : null;
    const t2 = stocks.length && (this.finnhubKey || this.proxyUrl) ? setInterval(() => void pollStocks(), this.stockPollMs) : null;

    return () => {
      active = false;
      unsubMock();
      if (t1) clearInterval(t1);
      if (t2) clearInterval(t2);
    };
  }
}

export { HttpError };
