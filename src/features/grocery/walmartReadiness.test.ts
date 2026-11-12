import type { WalmartPrice, WalmartPricesResponse } from '@/lib/api/commerce';

import { MAX_CART_LINES } from './walmart';
import { createWalmartReadiness, READINESS_TTL_MS } from './walmartReadiness';

function price(ingredientId: string, ready: boolean): WalmartPrice {
  return {
    ingredientId,
    itemId: ready ? `w-${ingredientId}` : null,
    status: ready ? 'found' : 'unmapped',
    name: ready ? ingredientId : null,
    priceCents: ready ? 199 : null,
    size: null,
    available: ready,
    url: null,
    image: null,
  };
}

/** Answers every id; the ones in `ready` have an in-stock item. */
function fetcher(ready: readonly string[]) {
  return jest.fn(async (ids: readonly string[]): Promise<WalmartPricesResponse> => ({
    configured: true,
    prices: ids.map((id) => price(id, ready.includes(id))),
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('walmart readiness', () => {
  it('knows nothing before a lookup and never asks on its own', () => {
    const readiness = createWalmartReadiness();
    expect(readiness.known(['flour', 'egg'])).toEqual({
      ready: new Set(),
      unknown: ['flour', 'egg'],
    });
  });

  it('asks a second caller only about the ids nobody asked about yet', async () => {
    const readiness = createWalmartReadiness();
    const fetchPrices = fetcher(['flour', 'milk']);
    await readiness.lookup(['egg', 'flour'], fetchPrices);
    const second = await readiness.lookup(['flour', 'milk'], fetchPrices);
    expect(fetchPrices.mock.calls).toEqual([[['egg', 'flour']], [['milk']]]);
    expect([...second.ready].sort()).toEqual(['flour', 'milk']);
    expect(readiness.known(['egg', 'flour', 'milk']).unknown).toEqual([]);
  });

  it('joins a lookup already running for overlapping ids instead of repeating it', async () => {
    const readiness = createWalmartReadiness();
    const first = deferred<WalmartPricesResponse>();
    const fetchPrices = jest.fn((ids: readonly string[]) =>
      ids.includes('egg')
        ? first.promise
        : Promise.resolve<WalmartPricesResponse>({
            configured: true,
            prices: ids.map((id) => price(id, true)),
          }),
    );
    const a = readiness.lookup(['egg', 'flour'], fetchPrices);
    const b = readiness.lookup(['flour', 'milk'], fetchPrices);
    expect(fetchPrices.mock.calls).toEqual([[['egg', 'flour']], [['milk']]]);
    first.resolve({ configured: true, prices: [price('egg', false), price('flour', true)] });
    expect([...(await a).ready]).toEqual(['flour']);
    expect([...(await b).ready].sort()).toEqual(['flour', 'milk']);
  });

  it('asks again once an answer is an hour old', async () => {
    let now = 1_000_000;
    const readiness = createWalmartReadiness(() => now);
    const fetchPrices = fetcher(['flour']);
    await readiness.lookup(['flour'], fetchPrices);
    now += READINESS_TTL_MS - 1;
    await readiness.lookup(['flour'], fetchPrices);
    expect(fetchPrices).toHaveBeenCalledTimes(1);
    now += 1;
    expect(readiness.known(['flour']).unknown).toEqual(['flour']);
    await readiness.lookup(['flour'], fetchPrices);
    expect(fetchPrices).toHaveBeenCalledTimes(2);
  });

  it('splits a long list into lookups the server accepts', async () => {
    const readiness = createWalmartReadiness();
    const ids = Array.from({ length: MAX_CART_LINES + 3 }, (_, i) => `item${i}`);
    const fetchPrices = fetcher([]);
    await readiness.lookup(ids, fetchPrices);
    expect(fetchPrices.mock.calls.map(([batch]) => batch.length)).toEqual([MAX_CART_LINES, 3]);
  });

  it('remembers nothing when the integration is not configured', async () => {
    const readiness = createWalmartReadiness();
    const result = await readiness.lookup(['flour'], async () => ({ configured: false }));
    expect(result).toEqual({ configured: false, ready: new Set() });
    expect(readiness.known(['flour']).unknown).toEqual(['flour']);
  });

  it('passes a failed lookup on and lets the next caller try again', async () => {
    const readiness = createWalmartReadiness();
    const failing = jest.fn().mockRejectedValue(new Error('quota'));
    await expect(readiness.lookup(['flour'], failing)).rejects.toThrow('quota');
    const fetchPrices = fetcher(['flour']);
    await readiness.lookup(['flour'], fetchPrices);
    expect(fetchPrices).toHaveBeenCalledWith(['flour']);
  });

  it('tells subscribers when answers arrive', async () => {
    const readiness = createWalmartReadiness();
    const listener = jest.fn();
    const unsubscribe = readiness.subscribe(listener);
    const before = readiness.version();
    await readiness.lookup(['flour'], fetcher(['flour']));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readiness.version()).not.toBe(before);
    unsubscribe();
    readiness.clear();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readiness.known(['flour']).unknown).toEqual(['flour']);
  });
});
