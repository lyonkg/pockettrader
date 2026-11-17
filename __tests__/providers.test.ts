/// <reference types="jest" />
import { MockProvider } from '../src/data/MockProvider';
import { LiveProvider } from '../src/data/LiveProvider';
import { Quote } from '../src/data/types';
import { maskKey, sanitizeKey } from '../src/data/keys';
import { describeDataMode, describeQuote } from '../src/data/status';

describe('MockProvider', () => {
  it('is deterministic for the same seed', async () => {
    const a = new MockProvider({ seed: 7, now: () => 1_000 });
    const b = new MockProvider({ seed: 7, now: () => 1_000 });
    for (let i = 0; i < 20; i++) { await a.getQuote('AAPL'); await b.getQuote('AAPL'); a.tick(); b.tick(); }
    expect((await a.getQuote('AAPL')).price).toBe((await b.getQuote('AAPL')).price);
    expect(await a.getHistory('BTC-USD', '1M')).toEqual(await b.getHistory('BTC-USD', '1M'));
  });

  it('differs across seeds and moves on tick', async () => {
    const a = new MockProvider({ seed: 1 });
    const b = new MockProvider({ seed: 2 });
    expect((await a.getQuote('TSLA')).price).not.toBe((await b.getQuote('TSLA')).price);
    const before = (await a.getQuote('TSLA')).price;
    a.tick();
    expect((await a.getQuote('TSLA')).price).not.toBe(before);
  });

  it('returns sane quotes with change vs previous close', async () => {
    const q = await new MockProvider().getQuote('nvda');
    expect(q.symbol).toBe('NVDA');
    expect(q.price).toBeGreaterThan(0);
    expect(q.change).toBeCloseTo(q.price - q.prevClose);
    expect(q.changePct).toBeCloseTo((q.change / q.prevClose) * 100);
    expect(q.source).toBe('mock');
  });

  it('history ends at the current price, is time-ordered and positive', async () => {
    const m = new MockProvider();
    for (const tf of ['1D', '1W', '1M', '1Y'] as const) {
      const h = await m.getHistory('ETH-USD', tf);
      const q = await m.getQuote('ETH-USD');
      expect(h.length).toBeGreaterThan(50);
      expect(h[h.length - 1].p).toBe(q.price);
      for (let i = 1; i < h.length; i++) expect(h[i].t).toBeGreaterThan(h[i - 1].t);
      expect(h.every((c) => c.p > 0)).toBe(true);
    }
  });

  it('pushes live quotes to subscribers and stops after unsubscribe', () => {
    jest.useFakeTimers();
    const m = new MockProvider({ tickMs: 1000 });
    const got: Quote[][] = [];
    const unsub = m.subscribe(['AAPL', 'BTC-USD'], (q) => got.push(q));
    expect(got).toHaveLength(1); // immediate snapshot
    jest.advanceTimersByTime(3000);
    expect(got).toHaveLength(4);
    expect(got[3].map((q) => q.symbol).sort()).toEqual(['AAPL', 'BTC-USD']);
    unsub();
    jest.advanceTimersByTime(5000);
    expect(got).toHaveLength(4);
    jest.useRealTimers();
  });
});

describe('LiveProvider', () => {
  const okJson = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const callInit = (fn: jest.Mock, i = 0) => (fn.mock.calls[i] as unknown as [string, { headers?: Record<string, string> }?])[1];

  it('parses CoinGecko crypto quotes', async () => {
    const fetchImpl = jest.fn(() => okJson({ bitcoin: { usd: 50_000, usd_24h_change: 2 } }));
    const p = new LiveProvider({ fetchImpl });
    const q = await p.getQuote('BTC-USD');
    expect(q.source).toBe('coingecko');
    expect(q.price).toBe(50_000);
    expect(q.changePct).toBe(2);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain('ids=bitcoin');
  });

  it('parses Finnhub stock quotes when a key is set', async () => {
    const fetchImpl = jest.fn(() => okJson({ c: 101, pc: 100, d: 1, dp: 1, t: 1700000000 }));
    const q = await new LiveProvider({ fetchImpl, finnhubKey: 'k' }).getQuote('AAPL');
    expect(q).toMatchObject({ symbol: 'AAPL', price: 101, prevClose: 100, source: 'finnhub' });
  });

  it('falls back to mock when the real provider errors or has no key', async () => {
    const failing = jest.fn(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }));
    const p = new LiveProvider({ fetchImpl: failing, finnhubKey: 'k', onError: () => {}, sleep: async () => {} });
    expect((await p.getQuote('ETH-USD')).source).toBe('mock');
    expect((await p.getQuote('AAPL')).source).toBe('mock');
    expect((await new LiveProvider({ onError: () => {} }).getQuote('MSFT')).source).toBe('mock');
    const h = await p.getHistory('ETH-USD', '1W');
    expect(h.length).toBeGreaterThan(10);
  });

  it('falls back to mock for stocks when no Finnhub key is configured', async () => {
    const fetchImpl = jest.fn(() => okJson({ c: 101, pc: 100, d: 1, dp: 1, t: 1700000000 }));
    const p = new LiveProvider({ fetchImpl, onError: () => {}, sleep: async () => {} });
    const q = await p.getQuote('AAPL');
    expect(q.source).toBe('mock');
    expect(q.origin).toBe('fallback');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(p.getStatus().hasFinnhubKey).toBe(false);
  });

  it('falls back to mock when fetch throws', async () => {
    const fetchImpl = jest.fn(() => Promise.reject(new Error('network down')));
    const p = new LiveProvider({ fetchImpl, finnhubKey: 'k', onError: () => {}, sleep: async () => {} });
    const stock = await p.getQuote('MSFT');
    const crypto = await p.getQuote('ETH-USD');
    expect(stock.origin).toBe('fallback');
    expect(crypto.origin).toBe('fallback');
    expect(stock.source).toBe('mock');
    expect(crypto.source).toBe('mock');
  });

  it('routes crypto to CoinGecko and stocks to Finnhub', async () => {
    const fetchImpl = jest.fn((url: string) => {
      if (String(url).includes('coingecko') || String(url).includes('simple/price')) {
        return okJson({ bitcoin: { usd: 60_000, usd_24h_change: -1 } });
      }
      if (String(url).includes('finnhub') || String(url).includes('/quote')) {
        return okJson({ c: 200, pc: 190, d: 10, dp: 5.26, t: 1700000000 });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    const p = new LiveProvider({ fetchImpl, finnhubKey: 'k', onError: () => {}, sleep: async () => {} });
    const btc = await p.getQuote('BTC-USD');
    const aapl = await p.getQuote('AAPL');
    expect(btc).toMatchObject({ source: 'coingecko', origin: 'real', price: 60_000 });
    expect(aapl).toMatchObject({ source: 'finnhub', origin: 'real', price: 200, symbol: 'AAPL' });
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('ids=bitcoin'))).toBe(true);
    expect(urls.some((u) => u.includes('symbol=AAPL'))).toBe(true);
    // Key is sent as a header, not in the URL.
    expect(urls.some((u) => /token=/i.test(u))).toBe(false);
    const fhIdx = fetchImpl.mock.calls.findIndex((c) => String(c[0]).includes('symbol=AAPL'));
    expect(callInit(fetchImpl, fhIdx)?.headers?.['X-Finnhub-Token']).toBe('k');
  });

  it('sends the CoinGecko demo key header when provided', async () => {
    const fetchImpl = jest.fn(() => okJson({ ethereum: { usd: 3_000, usd_24h_change: 0 } }));
    const p = new LiveProvider({ fetchImpl, coinGeckoKey: 'cg-demo', onError: () => {}, sleep: async () => {} });
    await p.getQuote('ETH-USD');
    expect(callInit(fetchImpl, 0)?.headers?.['x-cg-demo-api-key']).toBe('cg-demo');
  });

  it('uses the proxy URL when configured, without sending the Finnhub key to the client request', async () => {
    const fetchImpl = jest.fn((url: string) => {
      if (String(url).includes('/finnhub/quote')) return okJson({ c: 50, pc: 49, d: 1, dp: 2, t: 1700000000 });
      return okJson({ solana: { usd: 140, usd_24h_change: 1 } });
    });
    const p = new LiveProvider({
      fetchImpl,
      finnhubKey: 'should-not-leak',
      proxyUrl: 'https://proxy.example',
      onError: () => {},
      sleep: async () => {},
    });
    const q = await p.getQuote('AAPL');
    expect(q.source).toBe('finnhub');
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://proxy.example/finnhub/quote?symbol=AAPL');
    expect(callInit(fetchImpl, 0)?.headers?.['X-Finnhub-Token']).toBeUndefined();
    expect(p.getStatus().usingProxy).toBe(true);
  });

  it('keeps a recent real quote instead of jumping to mock after a later error', async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(() => okJson({ bitcoin: { usd: 80_000, usd_24h_change: 1 } }))
      .mockImplementation(() => Promise.reject(new Error('boom')));
    const p = new LiveProvider({ fetchImpl, onError: () => {}, sleep: async () => {}, now: () => 1_000 });
    const first = await p.getQuote('BTC-USD');
    expect(first.origin).toBe('real');
    expect(first.price).toBe(80_000);
    const second = await p.getQuote('BTC-USD');
    expect(second.origin).toBe('real');
    expect(second.price).toBe(80_000);
  });
});

describe('keys and badges', () => {
  it('masks keys and rejects unsafe values', () => {
    expect(maskKey('')).toBe('');
    expect(maskKey('abcd')).toBe('••••');
    expect(maskKey('supersecretkey')).toBe('••••••••••tkey');
    expect(maskKey('supersecretkey')).not.toContain('super');
    expect(sanitizeKey('  good_Key-1  ')).toBe('good_Key-1');
    expect(sanitizeKey('<script>')).toBe('');
    expect(sanitizeKey('x'.repeat(500))).toBe('');
  });

  it('describes live / mock / fallback badges', () => {
    const live = { symbol: 'BTC-USD', price: 1, prevClose: 1, change: 0, changePct: 0, timestamp: 1, source: 'coingecko' as const, origin: 'real' as const };
    const fb = { ...live, source: 'mock' as const, origin: 'fallback' as const };
    expect(describeDataMode('mock', { 'BTC-USD': live })).toEqual({ label: 'MOCK', tone: 'mock' });
    expect(describeDataMode('live', { 'BTC-USD': live })).toEqual({ label: 'LIVE DATA', tone: 'live' });
    expect(describeDataMode('live', { 'BTC-USD': fb })).toEqual({ label: 'MOCK FALLBACK', tone: 'fallback' });
    expect(describeQuote('mock', live)).toBeNull();
    expect(describeQuote('live', fb)?.label).toBe('MOCK FALLBACK');
  });
});
