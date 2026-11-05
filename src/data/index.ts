import { LiveProvider } from './LiveProvider';
import { MockProvider } from './MockProvider';
import { MarketDataProvider, ProviderMode } from './types';

export * from './types';

/** Single shared mock instance so prices stay continuous when switching providers. */
export const sharedMock = new MockProvider({ seed: 42, tickMs: 1500 });

export function createProvider(mode: ProviderMode, apiKey?: string): MarketDataProvider {
  if (mode === 'live') {
    return new LiveProvider({
      finnhubKey: apiKey,
      fallback: sharedMock,
      onError: (e, ctx) => console.warn(`[LiveProvider] ${ctx}:`, e instanceof Error ? e.message : e),
    });
  }
  return sharedMock;
}
