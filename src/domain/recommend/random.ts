/**
 * Small seeded random source so feeds vary per session yet replay exactly in tests. Not suitable
 * for anything security related.
 *
 * Both generators are counter based: a 32-bit counter (or a per-key hash) is pushed through an
 * avalanche finaliser, so any change of input bit flips about half of the output bits.
 */

export type Seed = string | number;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
/** 2^32 · (golden ratio − 1): a counter step that visits every 32-bit value. */
const WEYL_STEP = 0x9e3779b9;
const TWO_POW_32 = 4294967296;

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

/** Avalanche finaliser: scrambles a 32-bit value into a float in [0, 1). */
function toUnit(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / TWO_POW_32;
}

/** Returns a generator of floats in [0, 1): a Weyl-sequence counter fed through `toUnit`. */
export function createRandom(seed: Seed): () => number {
  let counter = hashSeed(seed);
  return () => {
    counter = (counter + WEYL_STEP) >>> 0;
    return toUnit(counter);
  };
}

/**
 * Maps a uniform draw to standard Gumbel noise. Adding it to `score / temperature` and sorting
 * yields a sample without replacement from the softmax over scores.
 */
export function uniformToGumbel(value: number): number {
  // Keep u strictly inside (0, 1) so both logarithms stay finite.
  const u = (value * (TWO_POW_32 - 2) + 1) / TWO_POW_32;
  return -Math.log(-Math.log(u));
}

/**
 * Per-key randomness under one seed: the value for a key depends only on the seed and the key, not
 * on call order or on which other keys are drawn. The seed is hashed once, so drawing for
 * thousands of keys costs one short hash each.
 */
export function keyedSource(seed: Seed) {
  // A separator byte keeps ("ab", "c") and ("a", "bc") apart.
  const base = fnv(hashSeed(seed), '\u0000');
  const uniform = (key: string) => toUnit(fnv(base, key) + WEYL_STEP);
  return {
    uniform,
    gumbel: (key: string) => uniformToGumbel(uniform(key)),
  };
}
