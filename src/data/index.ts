import { ENV_COINGECKO_API_KEY, ENV_DATA_PROXY_URL } from './config';
import { LiveProvider, LiveProviderOptions } from './LiveProvider';
import { MockProvider } from './MockProvider';
import { MarketDataProvider, ProviderMode } from './types';

export * from './types';
export { maskKey, sanitizeKey } from './keys';
export { describeDataMode, describeQuote } from './status';
export type { DataBadgeInfo, BadgeTone } from './status';

/** Single shared mock instance so prices stay continuous when switching providers. */
export const sharedMock = new MockProvider({ seed: 42, tickMs: 1500 });

export type CreateProviderOptions = Omit<LiveProviderOptions, 'finnhubKey' | 'fallback'>;

export function createProvider(
  mode: ProviderMode,
  apiKey?: string,
  opts: CreateProviderOptions = {},
): MarketDataProvider {
  if (mode === 'live') {
    return new LiveProvider({
      ...opts,
      finnhubKey: apiKey,
      coinGeckoKey: opts.coinGeckoKey ?? ENV_COINGECKO_API_KEY,
      proxyUrl: opts.proxyUrl ?? ENV_DATA_PROXY_URL,
      fallback: sharedMock,
      onError: opts.onError ?? ((e, ctx) => console.warn(`[LiveProvider] ${ctx}:`, e instanceof Error ? e.message : e)),
    });
  }
  return sharedMock;
}
