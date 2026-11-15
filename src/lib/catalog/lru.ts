/**
 * A small least-recently-used cache. Map iteration order is insertion order, so re-inserting on
 * every read keeps the oldest entry first and eviction is O(1).
 */
export class LruCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    readonly capacity: number,
    private readonly ttlMs = Infinity,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('LRU capacity must be a positive integer');
    }
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= Date.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
