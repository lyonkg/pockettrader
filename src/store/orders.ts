/** Pure, framework-free trading logic (easy to unit test). */

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected';

export interface Position {
  qty: number;
  avgCost: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number;
  status: OrderStatus;
  createdAt: number;
  filledAt?: number;
  fillPrice?: number;
  reason?: string;
}

export interface Account {
  cash: number;
  positions: Record<string, Position>;
  orders: Order[]; // newest first
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number;
}

const EPS = 1e-9;

export function createAccount(cash: number): Account {
  return { cash, positions: {}, orders: [] };
}

/** Cash committed to open buy-limit orders. */
export function reservedCash(acct: Account): number {
  return acct.orders
    .filter((o) => o.status === 'open' && o.side === 'buy')
    .reduce((s, o) => s + o.qty * (o.limitPrice ?? 0), 0);
}

/** Shares committed to open sell-limit orders. */
export function reservedQty(acct: Account, symbol: string): number {
  return acct.orders
    .filter((o) => o.status === 'open' && o.side === 'sell' && o.symbol === symbol)
    .reduce((s, o) => s + o.qty, 0);
}

export function availableCash(acct: Account): number {
  return acct.cash - reservedCash(acct);
}

export function availableQty(acct: Account, symbol: string): number {
  return (acct.positions[symbol]?.qty ?? 0) - reservedQty(acct, symbol);
}

/** Returns an error message, or null when the order is valid. */
const SYM_RE = /^[A-Za-z0-9._-]{1,16}$/;
const MAX_QTY = 1_000_000_000;

export function validateOrder(acct: Account, req: OrderRequest, marketPrice: number): string | null {
  if (typeof req.symbol !== 'string' || !req.symbol.trim()) return 'Symbol is required';
  if (!SYM_RE.test(req.symbol.trim())) return 'Invalid symbol';
  if (req.side !== 'buy' && req.side !== 'sell') return 'Invalid side';
  if (req.type !== 'market' && req.type !== 'limit') return 'Invalid order type';
  if (!isFinite(req.qty) || req.qty <= 0) return 'Quantity must be greater than 0';
  if (req.qty > MAX_QTY) return 'Quantity is too large';
  if (req.type === 'limit' && (!isFinite(req.limitPrice ?? NaN) || (req.limitPrice ?? 0) <= 0))
    return 'Limit price must be greater than 0';
  if (!isFinite(marketPrice) || marketPrice <= 0) return 'No market price available';
  const px = req.type === 'limit' ? (req.limitPrice as number) : marketPrice;
  if (req.side === 'buy') {
    const cost = req.qty * px;
    if (cost > availableCash(acct) + EPS) return `Insufficient cash: need ${cost.toFixed(2)}, available ${availableCash(acct).toFixed(2)}`;
  } else {
    const avail = availableQty(acct, req.symbol);
    if (req.qty > avail + EPS) return `Insufficient shares: you have ${+avail.toFixed(6)} available`;
  }
  return null;
}

/** Apply a fill to cash and positions (mutates a copy, returns the new account). */
export function applyFill(acct: Account, symbol: string, side: Side, qty: number, price: number): Account {
  const positions = { ...acct.positions };
  const pos = positions[symbol] ?? { qty: 0, avgCost: 0 };
  let cash = acct.cash;
  if (side === 'buy') {
    const newQty = pos.qty + qty;
    positions[symbol] = { qty: newQty, avgCost: (pos.qty * pos.avgCost + qty * price) / newQty };
    cash -= qty * price;
  } else {
    const newQty = pos.qty - qty;
    if (newQty <= EPS) delete positions[symbol];
    else positions[symbol] = { qty: newQty, avgCost: pos.avgCost };
    cash += qty * price;
  }
  return { ...acct, cash, positions };
}

let counter = 0;
export function newOrderId(now = Date.now()): string {
  counter = (counter + 1) % 1e6;
  return `${now.toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Place an order. Market orders fill immediately at marketPrice. Limit orders that are
 * already marketable fill immediately at the better of limit/market; otherwise they rest
 * as 'open'. Invalid orders are recorded as 'rejected'.
 */
export function placeOrder(
  acct: Account,
  req: OrderRequest,
  marketPrice: number,
  now = Date.now(),
): { account: Account; order: Order; error: string | null } {
  const error = validateOrder(acct, req, marketPrice);
  const base: Order = {
    id: newOrderId(now),
    symbol: req.symbol.trim().toUpperCase(),
    side: req.side,
    type: req.type,
    qty: req.qty,
    limitPrice: req.type === 'limit' ? req.limitPrice : undefined,
    status: 'open',
    createdAt: now,
  };
  if (error) {
    const order = { ...base, status: 'rejected' as const, reason: error };
    return { account: { ...acct, orders: [order, ...acct.orders] }, order, error };
  }
  if (req.type === 'market' || isMarketable(base, marketPrice)) {
    const fillPrice = req.type === 'market' ? marketPrice : bestFill(base, marketPrice);
    const filled: Order = { ...base, status: 'filled', filledAt: now, fillPrice };
    const after = applyFill(acct, base.symbol, req.side, req.qty, fillPrice);
    return { account: { ...after, orders: [filled, ...acct.orders] }, order: filled, error: null };
  }
  return { account: { ...acct, orders: [base, ...acct.orders] }, order: base, error: null };
}

export function isMarketable(o: Order, price: number): boolean {
  if (o.type !== 'limit' || o.limitPrice == null) return true;
  return o.side === 'buy' ? price <= o.limitPrice : price >= o.limitPrice;
}

function bestFill(o: Order, price: number): number {
  if (o.limitPrice == null) return price;
  return o.side === 'buy' ? Math.min(price, o.limitPrice) : Math.max(price, o.limitPrice);
}

/** Fill any open limit orders whose limit has been crossed by the latest prices. */
export function processOpenOrders(
  acct: Account,
  prices: Record<string, number>,
  now = Date.now(),
): { account: Account; filled: Order[] } {
  let account = acct;
  const filled: Order[] = [];
  const orders = acct.orders.map((o) => {
    if (o.status !== 'open') return o;
    const price = prices[o.symbol];
    if (price == null || !isMarketable(o, price)) return o;
    const fillPrice = bestFill(o, price);
    // Re-check resources at fill time (excluding this order's own reservation).
    if (o.side === 'sell' && (account.positions[o.symbol]?.qty ?? 0) + EPS < o.qty) {
      return { ...o, status: 'rejected' as const, reason: 'Insufficient shares at fill time' };
    }
    if (o.side === 'buy' && account.cash + EPS < o.qty * fillPrice) {
      return { ...o, status: 'rejected' as const, reason: 'Insufficient cash at fill time' };
    }
    account = applyFill(account, o.symbol, o.side, o.qty, fillPrice);
    const f: Order = { ...o, status: 'filled', filledAt: now, fillPrice };
    filled.push(f);
    return f;
  });
  return { account: { ...account, orders }, filled };
}

export function cancelOrder(acct: Account, id: string): Account {
  return {
    ...acct,
    orders: acct.orders.map((o) => (o.id === id && o.status === 'open' ? { ...o, status: 'cancelled' as const } : o)),
  };
}

export interface PortfolioSummary {
  marketValue: number;
  totalValue: number;
  costBasis: number;
  unrealizedPnl: number;
  dayPnl: number;
}

export function summarize(
  acct: Account,
  quotes: Record<string, { price: number; prevClose: number } | undefined>,
): PortfolioSummary {
  let marketValue = 0, costBasis = 0, dayPnl = 0;
  for (const [sym, pos] of Object.entries(acct.positions)) {
    const q = quotes[sym];
    const price = q?.price ?? pos.avgCost;
    marketValue += pos.qty * price;
    costBasis += pos.qty * pos.avgCost;
    if (q) dayPnl += pos.qty * (q.price - q.prevClose);
  }
  return { marketValue, totalValue: acct.cash + marketValue, costBasis, unrealizedPnl: marketValue - costBasis, dayPnl };
}
