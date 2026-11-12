import { createRandom, gumbel, hashSeed, keyedGumbel, keyedRandom, keyedSource } from './random';

describe('seeded randomness', () => {
  it('hashes seeds deterministically to 32-bit values', () => {
    expect(hashSeed('session-1')).toBe(hashSeed('session-1'));
    expect(hashSeed('session-1')).not.toBe(hashSeed('session-2'));
    expect(hashSeed(42)).toBe(hashSeed('42'));
    expect(hashSeed('x')).toBeGreaterThanOrEqual(0);
    expect(hashSeed('x')).toBeLessThan(2 ** 32);
  });

  it('replays the same sequence for the same seed', () => {
    const a = createRandom('seed');
    const b = createRandom('seed');
    const c = createRandom('other');
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
  });

  it('produces values in [0, 1) that are roughly uniform', () => {
    const random = createRandom(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      buckets[Math.floor(value * 10)]! += 1;
    }
    for (const count of buckets) expect(Math.abs(count - 1000)).toBeLessThan(150);
  });

  it('keeps Gumbel noise finite even at the extremes', () => {
    expect(Number.isFinite(gumbel(() => 0))).toBe(true);
    expect(Number.isFinite(gumbel(() => 1 - 2 ** -32))).toBe(true);
  });

  it('keys values by seed and key, independent of call order', () => {
    const first = keyedRandom('s', 'recipe-a');
    keyedRandom('s', 'recipe-b');
    expect(keyedRandom('s', 'recipe-a')).toBe(first);
    expect(keyedRandom('t', 'recipe-a')).not.toBe(first);
    expect(keyedGumbel('s', 'recipe-a')).toBe(keyedGumbel('s', 'recipe-a'));
    expect(keyedSource('s').uniform('recipe-a')).toBe(first);
  });

  it('keeps keyed values in [0, 1) and spreads them evenly', () => {
    const source = keyedSource('session');
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const value = source.uniform(`recipe:${i}`);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      buckets[Math.floor(value * 10)]! += 1;
    }
    for (const count of buckets) expect(Math.abs(count - 1000)).toBeLessThan(150);
  });

  it('separates seed and key boundaries', () => {
    expect(keyedRandom('ab', 'c')).not.toBe(keyedRandom('a', 'bc'));
  });
});
