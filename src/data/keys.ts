import { MAX_API_KEY_LEN } from './config';

/** Mask a secret for display: bullets plus the last 4 characters. Never returns the full key. */
export function maskKey(key: string): string {
  const t = key.trim();
  if (!t) return '';
  if (t.length <= 4) return '••••';
  return '•'.repeat(Math.max(8, t.length - 4)) + t.slice(-4);
}

/** Accept only a reasonably short token-like string; otherwise return empty. */
export function sanitizeKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t || t.length > MAX_API_KEY_LEN) return '';
  if (!/^[A-Za-z0-9._+\-/=]+$/.test(t)) return '';
  return t;
}
