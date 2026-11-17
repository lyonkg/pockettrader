import { ProviderMode } from './types';

/** Build-time defaults from env (Expo inlines EXPO_PUBLIC_* at bundle time). */
export const ENV_PROVIDER: ProviderMode =
  (process.env.EXPO_PUBLIC_DATA_PROVIDER ?? '').toLowerCase() === 'live' ? 'live' : 'mock';

/** @deprecated Prefer EXPO_PUBLIC_FINNHUB_API_KEY. Kept for backward compatibility. */
export const ENV_API_KEY: string = process.env.EXPO_PUBLIC_API_KEY ?? '';

export const ENV_FINNHUB_API_KEY: string = process.env.EXPO_PUBLIC_FINNHUB_API_KEY || ENV_API_KEY;

export const ENV_COINGECKO_API_KEY: string = process.env.EXPO_PUBLIC_COINGECKO_API_KEY ?? '';

/** Optional backend proxy base, e.g. https://pockettrader-proxy.example.workers.dev (no trailing slash). */
export const ENV_DATA_PROXY_URL: string = (process.env.EXPO_PUBLIC_DATA_PROXY_URL ?? '').trim().replace(/\/+$/, '');

export const STARTING_CASH = 100_000;

export const QUOTE_TTL_MS = 20_000;
export const CANDLE_TTL: Record<'1D' | '1W' | '1M' | '1Y', number> = {
  '1D': 5 * 60_000,
  '1W': 15 * 60_000,
  '1M': 15 * 60_000,
  '1Y': 30 * 60_000,
};
export const REQUEST_TIMEOUT_MS = 8_000;
export const COINGECKO_RPM = 30;
export const FINNHUB_RPM = 50;
export const MAX_API_KEY_LEN = 200;
export const STALE_QUOTE_GRACE_MS = 10 * 60_000;
