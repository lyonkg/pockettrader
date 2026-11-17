/// <reference types="jest" />
import { HttpError, TokenBucket, TtlCache, TimeoutError, coalesce, fetchJson, parseRetryAfter, redactUrl } from '../src/data/http';

const ok = (body: unknown, status = 200, headerMap: Record<string, string> = {}) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string): string | null => headerMap[n.toLowerCase()] ?? headerMap[n] ?? null },
    json: () => Promise.resolve(body),
  });

describe('TokenBucket', () => {
  it('allows up to capacity then refuses until refilled', () => {
    let now = 0;
    const b = new TokenBucket(2, 2 / 1000, () => now); // 2 tokens, 2 per second
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(false);
    expect(b.waitMs()).toBe(500);
    now = 500;
    expect(b.tryAcquire()).toBe(true);
    expect(b.tryAcquire()).toBe(false);
  });

  it('acquire waits then throws if the wait would exceed maxWaitMs', async () => {
    let now = 0;
    const b = new TokenBucket(1, 1 / 10_000, () => now);
    expect(b.tryAcquire()).toBe(true);
    const slept: number[] = [];
    await expect(b.acquire(1, { maxWaitMs: 100, sleep: async (ms) => { slept.push(ms); } })).rejects.toMatchObject({ status: 429 });
    expect(slept).toEqual([]);
  });
});

describe('TtlCache', () => {
  it('returns a fresh value, then misses, then serves stale', () => {
    let now = 0;
    const c = new TtlCache<string>(() => now);
    c.set('k', 'v', 100, 400);
    expect(c.get('k')).toBe('v');
    now = 150;
    expect(c.get('k')).toBeUndefined();
    expect(c.getStale('k')).toBe('v');
    now = 500;
    expect(c.getStale('k')).toBeUndefined();
  });
});

describe('coalesce', () => {
  it('dedups in-flight identical work', async () => {
    const map = new Map<string, Promise<number>>();
    let calls = 0;
    const start: Promise<void>[] = [];
    const fn = () => {
      calls += 1;
      return new Promise<number>((resolve) => start.push(Promise.resolve().then(() => resolve(42))));
    };
    const a = coalesce(map, 'x', fn);
    const b = coalesce(map, 'x', fn);
    expect(a).toBe(b);
    await Promise.all(start);
    expect(await a).toBe(42);
    expect(await b).toBe(42);
    expect(calls).toBe(1);
    const c = coalesce(map, 'x', fn);
    await Promise.all(start);
    expect(await c).toBe(42);
    expect(calls).toBe(2);
  });
});

describe('parseRetryAfter / redactUrl', () => {
  it('parses delta-seconds and HTTP dates, caps at 60s', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter('999')).toBe(60_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    const now = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');
    expect(parseRetryAfter('Wed, 21 Oct 2015 07:28:05 GMT', now)).toBe(5000);
  });

  it('redacts token query params', () => {
    expect(redactUrl('https://finnhub.io/api/v1/quote?symbol=AAPL&token=secret123')).toBe(
      'https://finnhub.io/api/v1/quote?symbol=AAPL&token=***',
    );
  });
});

describe('fetchJson', () => {
  it('returns JSON and caches within the TTL', async () => {
    const fetchImpl = jest.fn(() => ok({ usd: 1 }));
    const cache = new TtlCache<unknown>();
    const a = await fetchJson({ url: 'https://example.test/q', fetchImpl, cache, cacheTtlMs: 10_000 });
    const b = await fetchJson({ url: 'https://example.test/q', fetchImpl, cache, cacheTtlMs: 10_000 });
    expect(a).toEqual({ usd: 1 });
    expect(b).toEqual({ usd: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries HTTP 429 honoring Retry-After, then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(() => ok({}, 429, { 'retry-after': '1' }))
      .mockImplementationOnce(() => ok({ ok: true }));
    const slept: number[] = [];
    const data = await fetchJson({
      url: 'https://example.test/q',
      fetchImpl,
      sleep: async (ms) => { slept.push(ms); },
      maxRetries: 3,
    });
    expect(data).toEqual({ ok: true });
    expect(slept).toEqual([1000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausted 429 retries', async () => {
    const fetchImpl = jest.fn(() => ok({}, 429, { 'Retry-After': '0' }));
    await expect(
      fetchJson({ url: 'https://example.test/q', fetchImpl, sleep: async () => {}, maxRetries: 2 }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // attempt 0..2
  });

  it('coalesces in-flight identical requests', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchImpl = jest.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof ok>>>((resolve) => {
          resolveFetch = () => resolve({ ok: true, status: 200, headers: { get: (_n: string): string | null => null }, json: () => Promise.resolve({ n: 1 }) });
        }),
    );
    const inflight = new Map<string, Promise<unknown>>();
    const a = fetchJson({ url: 'https://example.test/q', fetchImpl, inflight });
    const b = fetchJson({ url: 'https://example.test/q', fetchImpl, inflight });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveFetch(null);
    expect(await a).toEqual({ n: 1 });
    expect(await b).toEqual({ n: 1 });
  });

  it('times out with TimeoutError', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(() => new Promise(() => {})) as unknown as import('../src/data/http').FetchLike;
    const p = fetchJson({ url: 'https://example.test/q', fetchImpl, timeoutMs: 8_000, maxRetries: 0 });
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await jest.advanceTimersByTimeAsync(8_000);
    await assertion;
    jest.useRealTimers();
  });
});
