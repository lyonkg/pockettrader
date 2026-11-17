/** Client-side HTTP helpers: token bucket, TTL cache, coalescing, 429 backoff, timeouts. */

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function redactUrl(url: string): string {
  return url.replace(/([?&](?:token|api[_-]?key)=)[^&]+/gi, '$1***');
}

/** Parse a Retry-After header (delta-seconds or HTTP date) into a millisecond delay, capped at 60s. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const sec = Number(trimmed);
  if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, 60_000);
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - now), 60_000);
  return undefined;
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Token bucket. `refillPerMs` is tokens added per millisecond
 * (e.g. 30 requests/min → 30 / 60_000).
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    readonly capacity: number,
    readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = this.now();
  }

  private refill() {
    const t = this.now();
    const elapsed = Math.max(0, t - this.lastRefill);
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = t;
  }

  tryAcquire(n = 1): boolean {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /** Milliseconds until `n` tokens are available (0 if already). */
  waitMs(n = 1): number {
    this.refill();
    if (this.tokens >= n) return 0;
    if (this.refillPerMs <= 0) return Number.POSITIVE_INFINITY;
    return Math.ceil((n - this.tokens) / this.refillPerMs);
  }

  async acquire(n = 1, opts?: { maxWaitMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<void> {
    const maxWaitMs = opts?.maxWaitMs ?? 2_000;
    const sleep = opts?.sleep ?? defaultSleep;
    const wait = this.waitMs(n);
    if (wait > maxWaitMs) throw new HttpError(429, 'Rate limit: no token available', wait);
    if (wait > 0) await sleep(wait);
    if (!this.tryAcquire(n)) throw new HttpError(429, 'Rate limit: no token available');
  }
}

export class TtlCache<V> {
  private map = new Map<string, { value: V; exp: number; staleExp: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.now() > e.exp) return undefined;
    return e.value;
  }

  /** Value past its fresh TTL but still within the stale window. */
  getStale(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.now() > e.staleExp) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: V, ttlMs: number, staleMs = Math.max(ttlMs * 15, ttlMs)): void {
    const t = this.now();
    this.map.set(key, { value, exp: t + ttlMs, staleExp: t + staleMs });
  }

  clear(): void {
    this.map.clear();
  }
}

/** Deduplicate in-flight promises for the same key. */
export function coalesce<T>(map: Map<string, Promise<T>>, key: string, fn: () => Promise<T>): Promise<T> {
  const existing = map.get(key);
  if (existing) return existing;
  const p = fn().finally(() => {
    if (map.get(key) === p) map.delete(key);
  });
  map.set(key, p);
  return p;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface FetchJsonOptions {
  url: string;
  fetchImpl: FetchLike;
  headers?: Record<string, string>;
  timeoutMs?: number;
  bucket?: TokenBucket;
  cache?: TtlCache<unknown>;
  cacheTtlMs?: number;
  cacheKey?: string;
  inflight?: Map<string, Promise<unknown>>;
  maxRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export async function fetchJson(opts: FetchJsonOptions): Promise<unknown> {
  const {
    url,
    fetchImpl,
    headers = {},
    timeoutMs = 8_000,
    bucket,
    cache,
    cacheTtlMs,
    cacheKey = url,
    inflight,
    maxRetries = 3,
    now = Date.now,
    sleep = defaultSleep,
  } = opts;

  if (cache && cacheTtlMs) {
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit;
  }

  const run = async (): Promise<unknown> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (bucket) await bucket.acquire(1, { sleep, maxWaitMs: timeoutMs });
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = fetchImpl(url, { headers, signal: ac?.signal });
        const res = await new Promise<Awaited<ReturnType<FetchLike>>>((resolve, reject) => {
          timer = setTimeout(() => {
            ac?.abort();
            reject(new TimeoutError(`Request timed out for ${redactUrl(url)}`));
          }, timeoutMs);
          work.then(resolve, reject);
        });
        if (timer) clearTimeout(timer);

        if (res.status === 429) {
          const ra = parseRetryAfter(res.headers?.get?.('Retry-After') ?? res.headers?.get?.('retry-after') ?? null, now());
          const backoff = ra ?? Math.min(8_000, 500 * 2 ** attempt);
          lastErr = new HttpError(429, `HTTP 429 for ${redactUrl(url)}`, backoff);
          if (attempt < maxRetries) {
            await sleep(backoff);
            continue;
          }
          throw lastErr;
        }
        if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} for ${redactUrl(url)}`);
        const data = await res.json();
        if (cache && cacheTtlMs) cache.set(cacheKey, data, cacheTtlMs);
        return data;
      } catch (e) {
        if (timer) clearTimeout(timer);
        lastErr = e;
        const is429 = e instanceof HttpError && e.status === 429;
        if (is429 && attempt < maxRetries) {
          await sleep(e.retryAfterMs ?? Math.min(8_000, 500 * 2 ** attempt));
          continue;
        }
        if (cache) {
          const stale = cache.getStale(cacheKey);
          if (stale !== undefined) return stale;
        }
        throw e;
      }
    }
    throw lastErr;
  };

  if (inflight) return coalesce(inflight, cacheKey, run);
  return run();
}
