import { ProviderMode } from './types';

/** Build-time defaults from env (Expo inlines EXPO_PUBLIC_* at bundle time). */
export const ENV_PROVIDER: ProviderMode =
  (process.env.EXPO_PUBLIC_DATA_PROVIDER ?? '').toLowerCase() === 'live' ? 'live' : 'mock';
export const ENV_API_KEY: string = process.env.EXPO_PUBLIC_API_KEY ?? '';

export const STARTING_CASH = 100_000;
