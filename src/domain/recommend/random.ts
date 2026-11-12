/**
 * Small seeded random source so feeds vary per session yet replay exactly in tests. Not suitable
 * for anything security related.
 */

export type Seed = string | number;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv(hash: number, text: string): number {
  let h = hash;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** 32-bit FNV-1a hash of the seed's string form. */
export function hashSeed(seed: Seed): number {
  return fnv(FNV_OFFSET, String(seed));
}

/** One mulberry32 output step for a 32-bit state, as a float in [0, 1). */
function mix(state: number): number {
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns a generator of floats in [0, 1) driven by a 32-bit state (mulberry32 mixing). */
export function createRandom(seed: Seed): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    return mix(state);
  };
}

function uniformToGumbel(value: number): number {
  // Keep u strictly inside (0, 1) so both logarithms stay finite.
  const u = (value * 4294967294 + 1) / 4294967296;
  return -Math.log(-Math.log(u));
}

/**
 * Standard Gumbel noise. Adding it to `score / temperature` and sorting yields a sample without
 * replacement from the softmax over scores.
 */
export function gumbel(random: () => number): number {
  return uniformToGumbel(random());
}

/**
 * Per-key randomness under one seed: the value for a key depends only on the seed and the key, not
 * on call order or on which other keys are drawn. The seed is hashed once, so drawing for
 * thousands of keys costs one short hash each.
 */
export function keyedSource(seed: Seed) {
  // A separator byte keeps ("ab", "c") and ("a", "bc") apart.
  const base = fnv(hashSeed(seed), '\u0000');
  const uniform = (key: string) => mix((fnv(base, key) + 0x6d2b79f5) >>> 0);
  return {
    uniform,
    gumbel: (key: string) => uniformToGumbel(uniform(key)),
  };
}

/** Convenience for one-off draws; prefer `keyedSource` in loops. */
export function keyedRandom(seed: Seed, key: string): number {
  return keyedSource(seed).uniform(key);
}

export function keyedGumbel(seed: Seed, key: string): number {
  return keyedSource(seed).gumbel(key);
}
