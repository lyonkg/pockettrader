export type AssetType = 'stock' | 'crypto';

export interface SymbolInfo {
  symbol: string;
  name: string;
  type: AssetType;
  basePrice: number;
  /** CoinGecko id for crypto assets */
  coingeckoId?: string;
}

export type QuoteSource = 'mock' | 'finnhub' | 'coingecko';
/** Where the displayed price came from. */
export type QuoteOrigin = 'real' | 'mock' | 'fallback';

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  timestamp: number;
  source: QuoteSource;
  origin: QuoteOrigin;
}

export interface Candle {
  t: number; // epoch ms
  p: number; // price (close)
}

export type Timeframe = '1D' | '1W' | '1M' | '1Y';

export type QuoteListener = (quotes: Quote[]) => void;

export type ProviderMode = 'mock' | 'live';

export interface DataStatus {
  mode: ProviderMode;
  hasFinnhubKey: boolean;
  usingProxy: boolean;
  lastError: string | null;
  symbolErrors: Record<string, string>;
}

export interface MarketDataProvider {
  readonly id: string;
  getQuote(symbol: string): Promise<Quote>;
  getHistory(symbol: string, timeframe: Timeframe): Promise<Candle[]>;
  /** Subscribe to live quotes. Returns an unsubscribe function. */
  subscribe(symbols: string[], listener: QuoteListener): () => void;
  getStatus(): DataStatus;
}
