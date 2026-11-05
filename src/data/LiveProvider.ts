import { getSymbolInfo } from './symbols';
import { MockProvider } from './MockProvider';
import { Candle, MarketDataProvider, Quote, QuoteListener, Timeframe } from './types';

/**
 * Real market data:
 *  - Crypto via CoinGecko public API (no key required).
 *  - Stocks via Finnhub (/quote) when an API key is provided.
 * Any failure (network, rate limit, missing key, unsupported endpoint) falls back
 * to the deterministic MockProvider for that call, so the app never breaks.
 */
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface LiveProviderOptions {
  finnhubKey?: string;
  fallback?: MockProvider;
  fetchImpl?: FetchLike;
  stockPollMs?: number;
  cryptoPollMs?: number;
  onError?: (err: unknown, context: string) => void;
}

const CG = 'https://api.coingecko.com/api/v3';
const FH = 'https://finnhub.io/api/v1';

const TF_DAYS: Record<Timeframe, string> = { '1D': '1', '1W': '7', '1M': '30', '1Y': '365' };

export class LiveProvider implements MarketDataProvider {
  readonly id = 'live';
  private fallback: MockProvider;
  private fetchImpl: FetchLike;
  private finnhubKey?: string;
  private stockPollMs: number;
  private cryptoPollMs: number;
  private onError?: (err: unknown, context: string) => void;
  private lastQuotes = new Map<string, Quote>();

  constructor(opts: LiveProviderOptions = {}) {
    this.fallback = opts.fallback ?? new MockProvider();
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.finnhubKey = opts.finnhubKey?.trim() || undefined;
    this.stockPollMs = opts.stockPollMs ?? 20000;
    this.cryptoPollMs = opts.cryptoPollMs ?? 30000;
    this.onError = opts.onError;
  }

  private async json(url: string): Promise<any> {
    const res = await this.fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(/token=[^&]+/, 'token=***')}`);
    return res.json();
  }

  private async cryptoQuotes(symbols: string[]): Promise<Quote[]> {
    const infos = symbols.map((s) => getSymbolInfo(s)).filter((i) => i?.coingeckoId);
    if (!infos.length) return [];
    const ids = infos.map((i) => i!.coingeckoId).join(',');
    const data = await this.json(`${CG}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    const out: Quote[] = [];
    for (const info of infos) {
      const row = data[info!.coingeckoId!];
      if (!row || typeof row.usd !== 'number') continue;
      const price = row.usd;
      const pct = typeof row.usd_24h_change === 'number' ? row.usd_24h_change : 0;
      const prevClose = price / (1 + pct / 100);
      out.push({ symbol: info!.symbol, price, prevClose, change: price - prevClose, changePct: pct, timestamp: Date.now(), source: 'coingecko' });
    }
    return out;
  }

  private async stockQuote(symbol: string): Promise<Quote> {
    if (!this.finnhubKey) throw new Error('No Finnhub API key configured');
    const d = await this.json(`${FH}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.finnhubKey}`);
    if (!d || typeof d.c !== 'number' || d.c === 0) throw new Error(`Finnhub: no quote for ${symbol}`);
    return { symbol, price: d.c, prevClose: d.pc || d.c, change: d.d ?? d.c - d.pc, changePct: d.dp ?? 0, timestamp: (d.t ? d.t * 1000 : Date.now()), source: 'finnhub' };
  }

  async getQuote(symbol: string): Promise<Quote> {
    const sym = symbol.toUpperCase();
    const info = getSymbolInfo(sym);
    try {
      const q = info?.type === 'crypto' ? (await this.cryptoQuotes([sym]))[0] : await this.stockQuote(sym);
      if (!q) throw new Error(`No quote for ${sym}`);
      this.lastQuotes.set(sym, q);
      return q;
    } catch (e) {
      this.onError?.(e, `getQuote ${sym}`);
      return this.fallback.getQuote(sym);
    }
  }

  async getHistory(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
    const sym = symbol.toUpperCase();
    const info = getSymbolInfo(sym);
    try {
      if (info?.type === 'crypto' && info.coingeckoId) {
        const d = await this.json(`${CG}/coins/${info.coingeckoId}/market_chart?vs_currency=usd&days=${TF_DAYS[timeframe]}`);
        const pts: Candle[] = (d.prices ?? []).map((r: [number, number]) => ({ t: r[0], p: r[1] }));
        if (pts.length < 2) throw new Error('empty history');
        // Downsample to keep chart rendering fast.
        const step = Math.max(1, Math.floor(pts.length / 200));
        const sampled = pts.filter((_, i) => i % step === 0);
        if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);
        return sampled;
      }
      // Finnhub candles require a paid plan; synthesize a deterministic history
      // anchored to the real last price instead.
      const q = this.lastQuotes.get(sym) ?? (await this.stockQuote(sym));
      return this.fallback.historyEndingAt(sym, timeframe, q.price);
    } catch (e) {
      this.onError?.(e, `getHistory ${sym}`);
      return this.fallback.getHistory(sym, timeframe);
    }
  }

  subscribe(symbols: string[], listener: QuoteListener): () => void {
    const syms = symbols.map((s) => s.toUpperCase());
    const crypto = syms.filter((s) => getSymbolInfo(s)?.type === 'crypto');
    const stocks = syms.filter((s) => getSymbolInfo(s)?.type !== 'crypto');
    let active = true;

    // Mock stream fills in anything the real APIs can't provide, until a real quote arrives.
    const realSeen = new Set<string>();
    const unsubMock = this.fallback.subscribe(syms, (qs) => {
      const missing = qs.filter((q) => !realSeen.has(q.symbol));
      if (missing.length && active) listener(missing);
    });

    const pollCrypto = async () => {
      try {
        const qs = await this.cryptoQuotes(crypto);
        qs.forEach((q) => { realSeen.add(q.symbol); this.lastQuotes.set(q.symbol, q); });
        if (active && qs.length) listener(qs);
      } catch (e) {
        this.onError?.(e, 'poll crypto');
        crypto.forEach((s) => realSeen.delete(s));
      }
    };
    const pollStocks = async () => {
      if (!this.finnhubKey) return;
      const results = await Promise.allSettled(stocks.map((s) => this.stockQuote(s)));
      const qs: Quote[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') { qs.push(r.value); realSeen.add(r.value.symbol); this.lastQuotes.set(r.value.symbol, r.value); }
        else { realSeen.delete(stocks[i]); this.onError?.(r.reason, `poll ${stocks[i]}`); }
      });
      if (active && qs.length) listener(qs);
    };

    if (crypto.length) pollCrypto();
    if (stocks.length) pollStocks();
    const t1 = crypto.length ? setInterval(pollCrypto, this.cryptoPollMs) : null;
    const t2 = stocks.length && this.finnhubKey ? setInterval(pollStocks, this.stockPollMs) : null;

    return () => {
      active = false;
      unsubMock();
      if (t1) clearInterval(t1);
      if (t2) clearInterval(t2);
    };
  }
}
