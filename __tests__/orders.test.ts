/// <reference types="jest" />
import {
  availableCash, cancelOrder, createAccount, placeOrder, processOpenOrders, summarize, validateOrder,
} from '../src/store/orders';

describe('order logic', () => {
  it('fills a market buy and updates cash/position', () => {
    const a = createAccount(10_000);
    const { account, order, error } = placeOrder(a, { symbol: 'AAPL', side: 'buy', type: 'market', qty: 10 }, 200);
    expect(error).toBeNull();
    expect(order.status).toBe('filled');
    expect(order.fillPrice).toBe(200);
    expect(account.cash).toBeCloseTo(8_000);
    expect(account.positions.AAPL).toEqual({ qty: 10, avgCost: 200 });
  });

  it('computes weighted average cost across buys and keeps it on sells', () => {
    let a = createAccount(10_000);
    a = placeOrder(a, { symbol: 'X', side: 'buy', type: 'market', qty: 10 }, 100).account;
    a = placeOrder(a, { symbol: 'X', side: 'buy', type: 'market', qty: 10 }, 200).account;
    expect(a.positions.X.avgCost).toBeCloseTo(150);
    a = placeOrder(a, { symbol: 'X', side: 'sell', type: 'market', qty: 5 }, 300).account;
    expect(a.positions.X).toEqual({ qty: 15, avgCost: 150 });
    expect(a.cash).toBeCloseTo(10_000 - 1000 - 2000 + 1500);
    a = placeOrder(a, { symbol: 'X', side: 'sell', type: 'market', qty: 15 }, 100).account;
    expect(a.positions.X).toBeUndefined();
  });

  it('rejects insufficient cash and insufficient shares', () => {
    const a = createAccount(1_000);
    expect(validateOrder(a, { symbol: 'A', side: 'buy', type: 'market', qty: 11 }, 100)).toMatch(/Insufficient cash/);
    expect(validateOrder(a, { symbol: 'A', side: 'sell', type: 'market', qty: 1 }, 100)).toMatch(/Insufficient shares/);
    const r = placeOrder(a, { symbol: 'A', side: 'buy', type: 'market', qty: 11 }, 100);
    expect(r.order.status).toBe('rejected');
    expect(r.account.cash).toBe(1_000);
  });

  it('rejects invalid symbols, sides, and oversized quantities', () => {
    const a = createAccount(1_000);
    expect(validateOrder(a, { symbol: '<script>', side: 'buy', type: 'market', qty: 1 }, 10)).toMatch(/Invalid symbol/);
    expect(validateOrder(a, { symbol: 'A', side: 'hold' as any, type: 'market', qty: 1 }, 10)).toMatch(/Invalid side/);
    expect(validateOrder(a, { symbol: 'A', side: 'buy', type: 'market', qty: 1e12 }, 10)).toMatch(/too large/);
  });

  it('rejects bad quantities and limit prices', () => {
    const a = createAccount(1_000);
    expect(validateOrder(a, { symbol: 'A', side: 'buy', type: 'market', qty: 0 }, 10)).toMatch(/Quantity/);
    expect(validateOrder(a, { symbol: 'A', side: 'buy', type: 'market', qty: NaN }, 10)).toMatch(/Quantity/);
    expect(validateOrder(a, { symbol: 'A', side: 'buy', type: 'limit', qty: 1, limitPrice: -1 }, 10)).toMatch(/Limit price/);
  });

  it('supports fractional crypto quantities', () => {
    const a = createAccount(1_000);
    const r = placeOrder(a, { symbol: 'BTC-USD', side: 'buy', type: 'market', qty: 0.01 }, 60_000);
    expect(r.error).toBeNull();
    expect(r.account.cash).toBeCloseTo(400);
  });

  it('rests a non-marketable buy limit, reserves cash, and fills when price crosses', () => {
    let a = createAccount(1_000);
    const r = placeOrder(a, { symbol: 'A', side: 'buy', type: 'limit', qty: 5, limitPrice: 90 }, 100);
    expect(r.order.status).toBe('open');
    a = r.account;
    expect(availableCash(a)).toBeCloseTo(550);
    // Can't spend reserved cash.
    expect(validateOrder(a, { symbol: 'B', side: 'buy', type: 'market', qty: 6 }, 100)).toMatch(/Insufficient cash/);

    let p = processOpenOrders(a, { A: 95 });
    expect(p.filled).toHaveLength(0);
    p = processOpenOrders(p.account, { A: 89 });
    expect(p.filled).toHaveLength(1);
    expect(p.filled[0].fillPrice).toBe(89); // price improvement
    expect(p.account.positions.A).toEqual({ qty: 5, avgCost: 89 });
    expect(p.account.cash).toBeCloseTo(1_000 - 445);
    expect(p.account.orders[0].status).toBe('filled');
  });

  it('fills a sell limit when price rises to the limit', () => {
    let a = placeOrder(createAccount(1_000), { symbol: 'A', side: 'buy', type: 'market', qty: 5 }, 100).account;
    a = placeOrder(a, { symbol: 'A', side: 'sell', type: 'limit', qty: 5, limitPrice: 120 }, 100).account;
    expect(validateOrder(a, { symbol: 'A', side: 'sell', type: 'market', qty: 1 }, 100)).toMatch(/Insufficient shares/);
    const p = processOpenOrders(a, { A: 121 });
    expect(p.filled).toHaveLength(1);
    expect(p.account.positions.A).toBeUndefined();
    expect(p.account.cash).toBeCloseTo(500 + 5 * 121);
  });

  it('fills a marketable limit immediately at the better price', () => {
    const r = placeOrder(createAccount(1_000), { symbol: 'A', side: 'buy', type: 'limit', qty: 1, limitPrice: 110 }, 100);
    expect(r.order.status).toBe('filled');
    expect(r.order.fillPrice).toBe(100);
  });

  it('cancels open orders and releases reservations', () => {
    const r = placeOrder(createAccount(1_000), { symbol: 'A', side: 'buy', type: 'limit', qty: 5, limitPrice: 90 }, 100);
    const a = cancelOrder(r.account, r.order.id);
    expect(a.orders[0].status).toBe('cancelled');
    expect(availableCash(a)).toBe(1_000);
    expect(processOpenOrders(a, { A: 1 }).filled).toHaveLength(0);
  });

  it('summarizes portfolio value and P&L', () => {
    const a = placeOrder(createAccount(1_000), { symbol: 'A', side: 'buy', type: 'market', qty: 2 }, 100).account;
    const s = summarize(a, { A: { price: 110, prevClose: 105 } });
    expect(s.marketValue).toBe(220);
    expect(s.totalValue).toBe(1_020);
    expect(s.unrealizedPnl).toBe(20);
    expect(s.dayPnl).toBe(10);
  });
});
