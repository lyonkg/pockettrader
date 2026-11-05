export function fmtMoney(n: number, opts: { sign?: boolean } = {}): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  const digits = abs !== 0 && abs < 1 ? 4 : 2;
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = n < 0 ? '-' : opts.sign && n > 0 ? '+' : '';
  return `${sign}$${s}`;
}

export function fmtPct(n: number): string {
  if (!isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function fmtQty(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(6)).toString();
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
