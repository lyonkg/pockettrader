import { SymbolInfo } from './types';

export const UNIVERSE: SymbolInfo[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', basePrice: 228.5 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', type: 'stock', basePrice: 431.2 },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', basePrice: 252.4 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', basePrice: 138.9 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock', basePrice: 186.3 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'stock', basePrice: 167.8 },
  { symbol: 'META', name: 'Meta Platforms', type: 'stock', basePrice: 585.1 },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'stock', basePrice: 712.6 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', type: 'stock', basePrice: 156.2 },
  { symbol: 'JPM', name: 'JPMorgan Chase', type: 'stock', basePrice: 221.4 },
  { symbol: 'V', name: 'Visa Inc.', type: 'stock', basePrice: 289.7 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'stock', basePrice: 575.3 },
  { symbol: 'BTC-USD', name: 'Bitcoin', type: 'crypto', basePrice: 67250, coingeckoId: 'bitcoin' },
  { symbol: 'ETH-USD', name: 'Ethereum', type: 'crypto', basePrice: 2630, coingeckoId: 'ethereum' },
  { symbol: 'SOL-USD', name: 'Solana', type: 'crypto', basePrice: 168.4, coingeckoId: 'solana' },
  { symbol: 'DOGE-USD', name: 'Dogecoin', type: 'crypto', basePrice: 0.142, coingeckoId: 'dogecoin' },
  { symbol: 'ADA-USD', name: 'Cardano', type: 'crypto', basePrice: 0.36, coingeckoId: 'cardano' },
  { symbol: 'XRP-USD', name: 'XRP', type: 'crypto', basePrice: 0.53, coingeckoId: 'ripple' },
];

const BY_SYMBOL = new Map(UNIVERSE.map((s) => [s.symbol, s]));

export function getSymbolInfo(symbol: string): SymbolInfo | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function searchSymbols(query: string): SymbolInfo[] {
  const q = query.trim().toUpperCase();
  if (!q) return UNIVERSE;
  return UNIVERSE.filter((s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q));
}

export const DEFAULT_WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'BTC-USD', 'ETH-USD'];
