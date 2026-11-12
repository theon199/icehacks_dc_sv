/**
 * Small seeded random source so feeds vary per session yet replay exactly in tests. Not suitable
 * for anything security related.
 */

export type Seed = string | number;

/** 32-bit FNV-1a hash of the seed's string form. */
export function hashSeed(seed: Seed): number {
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Returns a generator of floats in [0, 1) driven by a 32-bit state (mulberry32 mixing). */
export function createRandom(seed: Seed): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standard Gumbel noise. Adding it to `score / temperature` and sorting yields a sample without
 * replacement from the softmax over scores.
 */
export function gumbel(random: () => number): number {
  // Keep u strictly inside (0, 1) so both logarithms stay finite.
  const u = (random() * 4294967294 + 1) / 4294967296;
  return -Math.log(-Math.log(u));
}

/** A uniform value in [0, 1) that depends only on the seed and the key, not on call order. */
export function keyedRandom(seed: Seed, key: string): number {
  return createRandom(`${String(seed)}\u0000${key}`)();
}

/** Gumbel noise for one key under a seed; see `gumbel`. */
export function keyedGumbel(seed: Seed, key: string): number {
  return gumbel(createRandom(`${String(seed)}\u0000${key}`));
}
