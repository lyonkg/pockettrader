import { ProviderMode, Quote } from './types';

export type BadgeTone = 'live' | 'mock' | 'fallback';

export interface DataBadgeInfo {
  label: string;
  tone: BadgeTone;
}

/** Header / banner badge for the current data mode. Labels match the existing English UI. */
export function describeDataMode(mode: ProviderMode, quotes: Record<string, Quote>): DataBadgeInfo {
  if (mode !== 'live') return { label: 'MOCK', tone: 'mock' };
  const vals = Object.values(quotes);
  if (!vals.length) return { label: 'LIVE DATA', tone: 'live' };
  const anyReal = vals.some((q) => q.origin === 'real');
  if (anyReal) return { label: 'LIVE DATA', tone: 'live' };
  return { label: 'MOCK FALLBACK', tone: 'fallback' };
}

/** Per-quote badge, only meaningful in live mode. */
export function describeQuote(mode: ProviderMode, quote?: Quote): DataBadgeInfo | null {
  if (mode !== 'live' || !quote) return null;
  if (quote.origin === 'fallback') return { label: 'MOCK FALLBACK', tone: 'fallback' };
  if (quote.origin === 'real') return { label: 'LIVE', tone: 'live' };
  return { label: 'MOCK', tone: 'mock' };
}
