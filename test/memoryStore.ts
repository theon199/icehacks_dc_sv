/**
 * A tiny string-keyed store used to stand in for native key-value modules under Jest.
 * Every accessor is a jest.fn so tests can inspect `mock.calls` when they care about traffic.
 */
export interface MemoryStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  wipe(): void;
  readAsync(key: string): Promise<string | null>;
  writeAsync(key: string, value: string): Promise<void>;
  removeAsync(key: string): Promise<void>;
}

export function createMemoryStore(): MemoryStore {
  const entries: Record<string, string> = Object.create(null) as Record<string, string>;
  const read = jest.fn((key: string) => (key in entries ? (entries[key] ?? null) : null));
  const write = jest.fn((key: string, value: string) => {
    entries[key] = value;
  });
  const remove = jest.fn((key: string) => {
    delete entries[key];
  });
  const wipe = jest.fn(() => {
    for (const key of Object.keys(entries)) delete entries[key];
  });
  return {
    read,
    write,
    remove,
    wipe,
    readAsync: jest.fn(async (key: string) => read(key)),
    writeAsync: jest.fn(async (key: string, value: string) => write(key, value)),
    removeAsync: jest.fn(async (key: string) => remove(key)),
  };
}
