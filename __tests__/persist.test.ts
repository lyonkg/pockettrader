/// <reference types="jest" />
import { STARTING_CASH } from '../src/data/config';
import { createAccount } from '../src/store/orders';
import { parsePersisted, Persisted } from '../src/store/persist';

const defaults = (): Persisted => ({
  account: createAccount(STARTING_CASH),
  watchlist: ['AAPL'],
  settings: { provider: 'mock', apiKey: '' },
});

describe('parsePersisted', () => {
  it('returns defaults for invalid JSON, oversized payloads, or non-objects', () => {
    const d = defaults();
    expect(parsePersisted('not-json', d)).toEqual(d);
    expect(parsePersisted('[]', d)).toEqual(d);
    expect(parsePersisted('"x"', d)).toEqual(d);
    expect(parsePersisted('x'.repeat(500_001), d)).toEqual(d);
  });

  it('accepts a well-formed payload and ignores unknown fields', () => {
    const raw = JSON.stringify({
      account: { cash: 50_000, positions: { AAPL: { qty: 2, avgCost: 10 } }, orders: [] },
      watchlist: ['tsla', 'TSLA', 'nope!', 'BTC-USD'],
      settings: { provider: 'live', apiKey: '  abcdEFGH1234  ', extra: true },
      __proto__: { polluted: true },
    });
    const p = parsePersisted(raw, defaults());
    expect(p.account.cash).toBe(50_000);
    expect(p.account.positions.AAPL).toEqual({ qty: 2, avgCost: 10 });
    expect(p.watchlist).toEqual(['TSLA', 'BTC-USD']);
    expect(p.settings.provider).toBe('live');
    expect(p.settings.apiKey).toBe('abcdEFGH1234');
    expect((p as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });

  it('drops invalid positions, orders, keys, and provider values', () => {
    const raw = JSON.stringify({
      account: {
        cash: -5,
        positions: { AAPL: { qty: -1, avgCost: 1 } },
        orders: [{ id: '1', symbol: '<b>', side: 'buy', type: 'market', qty: 1, status: 'open', createdAt: 1 }],
      },
      watchlist: [1, null, ''],
      settings: { provider: 'hacked', apiKey: '<script>alert(1)</script>' },
    });
    const d = defaults();
    const p = parsePersisted(raw, d);
    expect(p.account).toEqual(d.account); // negative cash → fallback account
    expect(p.settings.provider).toBe('mock');
    expect(p.settings.apiKey).toBe('');
  });
});
