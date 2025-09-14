export class TTLCache<V> {
  private store = new Map<string, { value: V; expireAt: number }>();
  constructor(private maxSize: number = 500, private ttlMs: number = 6 * 60 * 60 * 1000) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expireAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V) {
    // Simple eviction: remove oldest if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value as string | undefined;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expireAt: Date.now() + this.ttlMs });
  }

  clear() {
    this.store.clear();
  }
}
