/// <reference types="jest" />
import { MockProvider } from '../src/data/MockProvider';
import { LiveProvider } from '../src/data/LiveProvider';
import { Quote } from '../src/data/types';

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
    const p = new LiveProvider({ fetchImpl: failing, finnhubKey: 'k', onError: () => {} });
    expect((await p.getQuote('ETH-USD')).source).toBe('mock');
    expect((await p.getQuote('AAPL')).source).toBe('mock');
    expect((await new LiveProvider({ onError: () => {} }).getQuote('MSFT')).source).toBe('mock');
    const h = await p.getHistory('ETH-USD', '1W');
    expect(h.length).toBeGreaterThan(10);
  });
});
