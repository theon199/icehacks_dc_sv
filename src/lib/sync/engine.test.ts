import { FakeSyncServer } from './__fixtures__/fakeServer';
import { memoryAdapter, type MemoryAdapter } from './__fixtures__/memoryAdapter';
import {
  backoffDelay,
  createSyncEngine,
  FULL_PULL_MAX_AGE_MS,
  MAX_DOC_BYTES,
  PUSH_DEBOUNCE_MS,
  type SyncEngine,
  type SyncStatus,
} from './engine';
import { memoryLedgerStorage } from './__fixtures__/memoryLedgerStorage';
import { LEDGER_HEADER_KEY, ledgerBucketKey } from './ledger';
import { SyncError, type LifecycleState, type SyncTransport } from './types';

const T0 = Date.parse('2026-11-11T10:00:00.000Z');

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await jest.advanceTimersByTimeAsync(0);
}

async function elapse(ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  await settle();
}

interface Device {
  name: string;
  notes: MemoryAdapter;
  storage: ReturnType<typeof memoryLedgerStorage>;
  engine: SyncEngine;
  statuses: SyncStatus[];
  setOnline(online: boolean): void;
  lifecycle(state: LifecycleState): void;
  restart(): Promise<void>;
}

function makeDevice(
  server: FakeSyncServer,
  name: string,
  options: { userId?: string; transport?: SyncTransport; extra?: MemoryAdapter[] } = {},
): Device {
  const notes = memoryAdapter('notes');
  const storage = memoryLedgerStorage();
  let online = true;
  const onlineListeners = new Set<(online: boolean) => void>();
  const lifeListeners = new Set<(state: LifecycleState) => void>();
  const statuses: SyncStatus[] = [];
  const build = () =>
    createSyncEngine({
      userId: options.userId ?? 'user-1',
      deviceId: name,
      transport: options.transport ?? server.transport({ online: () => online }),
      adapters: [notes, ...(options.extra ?? [])],
      storage,
      connectivity: {
        isOnline: () => online,
        subscribe: (listener) => {
          onlineListeners.add(listener);
          return () => onlineListeners.delete(listener);
        },
      },
      lifecycle: {
        subscribe: (listener) => {
          lifeListeners.add(listener);
          return () => lifeListeners.delete(listener);
        },
      },
      random: () => 1,
      onStatus: (status) => statuses.push(status),
    });
  const device: Device = {
    name,
    notes,
    storage,
    engine: build(),
    statuses,
    setOnline(value) {
      online = value;
      onlineListeners.forEach((listener) => listener(value));
    },
    lifecycle(state) {
      lifeListeners.forEach((listener) => listener(state));
    },
    async restart() {
      await device.engine.stop();
      device.engine = build();
      await device.engine.start();
      await settle();
    },
  };
  return device;
}

async function started(device: Device): Promise<Device> {
  await device.engine.start();
  await settle();
  return device;
}

const seedDoc = (docId: string, data: Record<string, unknown>, at = T0 - 60_000) => ({
  collection: 'notes',
  doc_id: docId,
  data,
  updated_at: new Date(at).toISOString(),
  device_id: 'other-device',
  deleted_at: null,
});

let server: FakeSyncServer;

beforeEach(() => {
  jest.useFakeTimers({ now: T0 });
  server = new FakeSyncServer();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('bootstrap', () => {
  it('pulls everything on first start, paging with p_full after the first page', async () => {
    server.seed(seedDoc('a', { text: 'A' }));
    server.seed(seedDoc('b', { text: 'B' }));
    server.seed(seedDoc('c', { text: 'C' }));
    server.pageSize = 2;
    const device = await started(makeDevice(server, 'phone'));

    expect(server.pullCalls).toEqual([
      { since: 0, limit: 500, full: false },
      { since: 2, limit: 500, full: true },
    ]);
    expect([...device.notes.docs.keys()].sort()).toEqual(['a', 'b', 'c']);
    // Applying server data is not a local edit: nothing is echoed back.
    await elapse(PUSH_DEBOUNCE_MS * 2);
    expect(server.pushCalls).toHaveLength(0);
    expect(device.storage.current?.cursor).toBe(3);
    expect(device.storage.current?.bootstrapped).toBe(true);
  });

  it('lets the account data win over defaults present before the first pull', async () => {
    server.seed(seedDoc('settings', { units: 'metric' }));
    const device = makeDevice(server, 'phone');
    device.notes.docs.set('settings', { units: 'us' });
    device.notes.docs.set('local-only', { text: 'kept' });
    await started(device);
    await elapse(PUSH_DEBOUNCE_MS);

    expect(device.notes.docs.get('settings')).toEqual({ units: 'metric' });
    expect(server.get('notes', 'settings')?.data).toEqual({ units: 'metric' });
    // A document only this device had is pushed after the merge.
    expect(server.get('notes', 'local-only')?.data).toEqual({ text: 'kept' });
  });

  it('does not push edits made before the first pull completes', async () => {
    const device = makeDevice(server, 'phone');
    device.setOnline(false);
    await started(device);
    device.notes.set('a', { text: 'offline' });
    await elapse(PUSH_DEBOUNCE_MS * 2);
    expect(server.pullCalls).toHaveLength(0);
    expect(server.pushCalls).toHaveLength(0);

    device.setOnline(true);
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.pullCalls[0]?.since).toBe(0);
    expect(server.get('notes', 'a')?.data).toEqual({ text: 'offline' });
  });
});

describe('pushing local changes', () => {
  it('debounces pushes and coalesces rapid edits', async () => {
    const device = await started(makeDevice(server, 'phone'));
    device.notes.set('a', { text: '1' });
    await elapse(500);
    device.notes.set('a', { text: '2' });
    device.notes.set('b', { text: 'x' });
    await elapse(PUSH_DEBOUNCE_MS - 100);
    expect(server.pushCalls).toHaveLength(0);
    await elapse(200);
    expect(server.pushCalls).toHaveLength(1);
    expect(server.pushCalls[0]?.map((doc) => [doc.doc_id, doc.data])).toEqual([
      ['a', { text: '2' }],
      ['b', { text: 'x' }],
    ]);
    expect(device.engine.getStatus().pending).toBe(0);
  });

  it('pushes immediately when the app goes to the background', async () => {
    const device = await started(makeDevice(server, 'phone'));
    device.notes.set('a', { text: 'bye' });
    device.lifecycle('background');
    await settle();
    expect(server.get('notes', 'a')?.data).toEqual({ text: 'bye' });
  });

  it('does not push unchanged content again', async () => {
    const device = await started(makeDevice(server, 'phone'));
    device.notes.set('a', { text: 'same' });
    await elapse(PUSH_DEBOUNCE_MS);
    device.notes.set('a', { text: 'same' });
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.pushCalls).toHaveLength(1);
  });

  it('keeps an edit made while its push is in flight and sends it next', async () => {
    const device = await started(makeDevice(server, 'phone'));
    server.beforePush = () => {
      server.beforePush = null;
      device.notes.set('a', { text: 'during' });
    };
    device.notes.set('a', { text: 'before' });
    await elapse(PUSH_DEBOUNCE_MS);
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.get('notes', 'a')?.data).toEqual({ text: 'during' });
    expect(device.engine.getStatus().pending).toBe(0);
  });

  it('withholds documents over the size limit and syncs the rest', async () => {
    const device = await started(makeDevice(server, 'phone'));
    device.notes.set('big', { text: 'x'.repeat(MAX_DOC_BYTES + 10) });
    device.notes.set('small', { text: 'ok' });
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.get('notes', 'big')).toBeUndefined();
    expect(server.get('notes', 'small')).toBeDefined();
    expect(device.engine.getStatus().pending).toBe(0);
  });
});

describe('conflicts', () => {
  it('converges two devices on the last write', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    const tablet = await started(makeDevice(server, 'tablet'));

    phone.notes.set('a', { text: 'phone' });
    await elapse(10);
    tablet.notes.set('a', { text: 'tablet' });
    // The tablet pushes first; the phone's older version is then rejected as stale.
    await tablet.engine.flush();
    await phone.engine.flush();
    await settle();

    expect(server.get('notes', 'a')?.data).toEqual({ text: 'tablet' });
    expect(phone.notes.docs.get('a')).toEqual({ text: 'tablet' });
    await phone.engine.syncNow();
    await tablet.engine.syncNow();
    expect(tablet.notes.docs.get('a')).toEqual({ text: 'tablet' });
    expect(phone.engine.getStatus().pending).toBe(0);
  });

  it('adopts the server copy when a write is rejected as stale', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    phone.notes.set('a', { text: 'mine' });
    // Another device wrote a newer version the phone has not pulled yet.
    server.seed(seedDoc('a', { text: 'theirs' }, Date.now() + 30_000));
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.pushCalls).toHaveLength(1);
    expect(phone.notes.docs.get('a')).toEqual({ text: 'theirs' });
    await elapse(PUSH_DEBOUNCE_MS * 2);
    expect(server.pushCalls).toHaveLength(1);
  });

  it('keeps a newer local edit when pulling an older remote version', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    phone.setOnline(false);
    await elapse(60_000);
    phone.notes.set('a', { text: 'newer local' });
    server.seed(seedDoc('a', { text: 'older remote' }, Date.now() - 30_000));
    phone.setOnline(true);
    await elapse(PUSH_DEBOUNCE_MS);
    expect(phone.notes.docs.get('a')).toEqual({ text: 'newer local' });
    expect(server.get('notes', 'a')?.data).toEqual({ text: 'newer local' });
  });

  it('stamps edits after the version it last saw, even with a slow clock', async () => {
    server.seed(seedDoc('a', { text: 'from the future' }, T0 + 10 * 60_000));
    const phone = await started(makeDevice(server, 'phone'));
    phone.notes.set('a', { text: 'edited after seeing it' });
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.get('notes', 'a')?.data).toEqual({ text: 'edited after seeing it' });
  });
});

describe('deletion', () => {
  it('sends tombstones and removes the document on other devices', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    const tablet = await started(makeDevice(server, 'tablet'));
    phone.notes.set('a', { text: 'temp' });
    await phone.engine.flush();
    await tablet.engine.syncNow();
    expect(tablet.notes.docs.has('a')).toBe(true);

    phone.notes.remove('a');
    await phone.engine.flush();
    const row = server.get('notes', 'a');
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.data).toEqual({});

    await tablet.engine.syncNow();
    expect(tablet.notes.docs.has('a')).toBe(false);
    await elapse(PUSH_DEBOUNCE_MS * 2);
    // The tablet does not echo the deletion back.
    expect(server.pushCalls).toHaveLength(2);
  });

  it('deletes remotely what a store drops on its own after a pull', async () => {
    server.seed(seedDoc('old', { n: 1 }));
    server.seed(seedDoc('new', { n: 2 }));
    const phone = makeDevice(server, 'phone');
    phone.notes.cap = 1;
    await started(phone);
    await elapse(PUSH_DEBOUNCE_MS);
    expect([...phone.notes.docs.keys()]).toEqual(['new']);
    expect(server.get('notes', 'old')?.deleted_at).not.toBeNull();
    expect(server.get('notes', 'new')?.deleted_at).toBeNull();
  });

  it('deletes remotely what a capped store evicts locally to make room', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    phone.notes.set('mine', { n: 1 });
    await phone.engine.flush();
    phone.notes.cap = 1;
    server.seed(seedDoc('theirs', { n: 2 }, Date.now()));
    await phone.engine.syncNow();
    await elapse(PUSH_DEBOUNCE_MS);
    expect([...phone.notes.docs.keys()]).toEqual(['theirs']);
    expect(server.get('notes', 'mine')?.deleted_at).not.toBeNull();
    expect(server.get('notes', 'theirs')?.deleted_at).toBeNull();
  });

  it('keeps remote documents this build cannot read instead of deleting them', async () => {
    server.seed(seedDoc('future', { shape: 'unknown' }));
    const phone = makeDevice(server, 'phone');
    phone.notes.validate = (data) => !(data as { shape?: string }).shape;
    await started(phone);
    await elapse(PUSH_DEBOUNCE_MS * 2);
    expect(phone.notes.docs.has('future')).toBe(false);
    expect(server.get('notes', 'future')?.deleted_at).toBeNull();
    expect(server.pushCalls).toHaveLength(0);
  });
});

describe('offline and failures', () => {
  it('queues changes offline and sends them in one push when back online', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    phone.setOnline(false);
    phone.notes.set('a', { n: 1 });
    phone.notes.set('b', { n: 2 });
    phone.notes.remove('a');
    await elapse(PUSH_DEBOUNCE_MS * 3);
    expect(server.pushCalls).toHaveLength(0);
    expect(phone.engine.getStatus()).toMatchObject({ phase: 'offline', pending: 2 });

    phone.setOnline(true);
    await settle();
    expect(server.pushCalls).toHaveLength(1);
    expect(server.get('notes', 'b')?.data).toEqual({ n: 2 });
    expect(server.get('notes', 'a')?.deleted_at).not.toBeNull();
  });

  it('survives a restart with changes still in the outbox', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    phone.setOnline(false);
    phone.notes.set('a', { n: 1 });
    await elapse(1000);
    phone.setOnline(true);
    server.failNext = 5;
    await phone.restart();
    expect(server.get('notes', 'a')).toBeUndefined();
    server.failNext = 0;
    await elapse(60_000);
    expect(server.get('notes', 'a')?.data).toEqual({ n: 1 });
  });

  it('backs off exponentially after network failures', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    server.failNext = 3;
    phone.notes.set('a', { n: 1 });
    await elapse(PUSH_DEBOUNCE_MS);
    expect(phone.engine.getStatus().phase).toBe('waiting');
    await elapse(backoffDelay(1, () => 1) + backoffDelay(2, () => 1) - 10);
    expect(server.get('notes', 'a')).toBeUndefined();
    await elapse(backoffDelay(3, () => 1) + 20);
    expect(server.get('notes', 'a')?.data).toEqual({ n: 1 });
    expect(phone.engine.getStatus()).toMatchObject({ phase: 'idle', lastError: null });
  });

  it('pauses pushing over quota until something changes locally', async () => {
    let quota = true;
    const base = server.transport();
    const transport: SyncTransport = {
      pull: base.pull,
      push: async (docs) => {
        if (quota) throw new SyncError('quota', 'over');
        return base.push(docs);
      },
    };
    const phone = await started(makeDevice(server, 'phone', { transport }));
    phone.notes.set('a', { n: 1 });
    await elapse(PUSH_DEBOUNCE_MS);
    await elapse(10 * 60_000);
    expect(server.get('notes', 'a')).toBeUndefined();
    quota = false;
    phone.notes.remove('a');
    phone.notes.set('b', { n: 2 });
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.get('notes', 'b')).toBeDefined();
  });

  it('isolates a document the server refuses and syncs the rest', async () => {
    const base = server.transport();
    const transport: SyncTransport = {
      pull: base.pull,
      push: async (docs) => {
        if (docs.some((doc) => doc.doc_id === 'bad')) throw new SyncError('invalid', 'nope');
        return base.push(docs);
      },
    };
    const phone = await started(makeDevice(server, 'phone', { transport }));
    for (const id of ['a', 'b', 'bad', 'c']) phone.notes.set(id, { id });
    await elapse(PUSH_DEBOUNCE_MS);
    expect(['a', 'b', 'c'].every((id) => server.get('notes', id))).toBe(true);
    expect(server.get('notes', 'bad')).toBeUndefined();
    expect(phone.engine.getStatus().pending).toBe(0);
  });

  it('stops when the session belongs to another account', async () => {
    const transport: SyncTransport = {
      pull: async () => {
        throw new SyncError('wrong_user', 'someone else');
      },
      push: async () => {
        throw new SyncError('wrong_user', 'someone else');
      },
    };
    const phone = await started(makeDevice(server, 'phone', { transport }));
    expect(phone.engine.getStatus().phase).toBe('stopped');
  });
});

describe('resync after compaction', () => {
  it('rebuilds from a full pull and drops synced documents the server no longer has', async () => {
    const phone = await started(makeDevice(server, 'phone'));
    const tablet = await started(makeDevice(server, 'tablet'));
    phone.notes.set('keep', { n: 1 });
    phone.notes.set('gone', { n: 2 });
    await phone.engine.flush();
    await tablet.engine.syncNow();
    expect(tablet.notes.docs.has('gone')).toBe(true);

    // The tablet goes quiet; meanwhile 'gone' is deleted and its tombstone compacted away.
    tablet.setOnline(false);
    phone.notes.remove('gone');
    for (let i = 0; i < 3; i += 1) phone.notes.set(`more-${i}`, { i });
    await phone.engine.flush();
    server.compactTombstones();
    tablet.notes.set('draft', { n: 9 });

    server.pageSize = 2;
    server.pullCalls = [];
    tablet.setOnline(true);
    await settle();

    expect(server.pullCalls[0]?.full).toBe(false);
    expect(server.pullCalls[1]).toMatchObject({ since: 0, full: false });
    expect(server.pullCalls.slice(2).every((call) => call.full)).toBe(true);
    expect(tablet.notes.docs.has('gone')).toBe(false);
    expect(tablet.notes.docs.has('keep')).toBe(true);
    expect(tablet.notes.docs.has('more-2')).toBe(true);
    // Unsent local work survives the rebuild and is pushed.
    expect(tablet.notes.docs.has('draft')).toBe(true);
    expect(server.get('notes', 'draft')?.data).toEqual({ n: 9 });
    expect(tablet.storage.current?.fullPull).toBeNull();
  });

  it('restarts a full pull left unfinished for more than a day', async () => {
    for (let i = 0; i < 4; i += 1) server.seed(seedDoc(`d${i}`, { i }));
    server.pageSize = 2;
    const base = server.transport();
    let pulls = 0;
    const transport: SyncTransport = {
      push: base.push,
      pull: async (since, limit, full) => {
        pulls += 1;
        if (pulls === 2) throw new SyncError('network', 'dropped');
        return base.pull(since, limit, full);
      },
    };
    const flaky = await started(makeDevice(server, 'phone', { transport }));
    expect(flaky.storage.current?.fullPull).toMatchObject({ cursor: 2 });

    await flaky.engine.stop();
    jest.setSystemTime(Date.now() + FULL_PULL_MAX_AGE_MS + 60_000);
    server.pullCalls = [];
    await flaky.restart();
    expect(server.pullCalls[0]).toMatchObject({ since: 0, full: false });
    expect(flaky.notes.docs.size).toBe(4);
  });

  it('resumes a recent unfinished full pull where it stopped', async () => {
    for (let i = 0; i < 4; i += 1) server.seed(seedDoc(`d${i}`, { i }));
    server.pageSize = 2;
    let pulls = 0;
    const base = server.transport();
    const transport: SyncTransport = {
      push: base.push,
      pull: async (since, limit, full) => {
        pulls += 1;
        if (pulls === 2) throw new SyncError('network', 'dropped');
        return base.pull(since, limit, full);
      },
    };
    const phone = await started(makeDevice(server, 'phone', { transport }));
    await phone.engine.stop();
    server.pullCalls = [];
    await phone.restart();
    expect(server.pullCalls[0]).toMatchObject({ since: 2, full: true });
    expect(phone.notes.docs.size).toBe(4);
  });
});

describe('backoffDelay', () => {
  it('doubles up to a cap, with jitter', () => {
    expect(backoffDelay(1, () => 1)).toBe(2000);
    expect(backoffDelay(2, () => 1)).toBe(4000);
    expect(backoffDelay(3, () => 0)).toBe(4000);
    expect(backoffDelay(30, () => 1)).toBe(5 * 60_000);
  });
});

describe('ledger persistence', () => {
  it('saves only the header and the changed collection after a local edit', async () => {
    const feedback = memoryAdapter('feedback');
    const device = await started(makeDevice(server, 'phone', { extra: [feedback] }));
    device.notes.set('n', { text: 'note' });
    await elapse(PUSH_DEBOUNCE_MS * 2);
    device.storage.writes.length = 0;

    feedback.set('f1', { recipeId: 'r1', signal: 'like' });
    // After the save debounce, before the push debounce.
    await elapse(500);
    expect(device.storage.writes).toEqual([ledgerBucketKey('feedback'), LEDGER_HEADER_KEY]);

    device.storage.writes.length = 0;
    await elapse(PUSH_DEBOUNCE_MS);
    expect(server.get('feedback', 'f1')).toBeDefined();
    expect(device.storage.writes).not.toContain(ledgerBucketKey('notes'));
    expect(device.storage.current?.docs.notes?.n?.s).toBe(true);
  });
});

describe('rejections the server cannot settle', () => {
  function rejectingTransport(
    reason: 'future_timestamp' | 'stale',
    shouldReject: () => boolean,
  ): SyncTransport & { pushed: string[] } {
    const base = server.transport();
    const pushed: string[] = [];
    return {
      pushed,
      pull: base.pull,
      push: async (docs) => {
        pushed.push(...docs.map((doc) => doc.doc_id));
        if (!shouldReject()) return base.push(docs);
        return {
          applied: [],
          rejected: docs.map((doc) => ({
            collection: doc.collection,
            doc_id: doc.doc_id,
            reason,
            server: null,
          })),
        };
      },
    };
  }

  it('holds back a document dated in the future until the next start', async () => {
    let reject = true;
    const transport = rejectingTransport('future_timestamp', () => reject);
    const phone = await started(makeDevice(server, 'phone', { transport }));
    phone.notes.set('a', { text: 'from a fast clock' });
    await elapse(PUSH_DEBOUNCE_MS);
    expect(transport.pushed).toEqual(['a']);
    expect(phone.engine.getStatus().pending).toBe(0);

    // Later drains do not send it again.
    await phone.engine.syncNow();
    await elapse(PUSH_DEBOUNCE_MS);
    expect(transport.pushed).toEqual(['a']);

    reject = false;
    await phone.restart();
    await elapse(PUSH_DEBOUNCE_MS);
    expect(transport.pushed).toEqual(['a', 'a']);
    expect(server.get('notes', 'a')?.data).toEqual({ text: 'from a fast clock' });
  });

  it('pulls the server copy when a stale rejection does not include it', async () => {
    let reject = true;
    const transport = rejectingTransport('stale', () => reject);
    const phone = await started(makeDevice(server, 'phone', { transport }));
    server.seed(seedDoc('a', { text: 'newer elsewhere' }, T0 + 10 * 60_000));
    phone.notes.set('a', { text: 'older here' });
    await elapse(PUSH_DEBOUNCE_MS);
    reject = false;
    await elapse(PUSH_DEBOUNCE_MS);

    expect(transport.pushed).toEqual(['a']);
    expect(phone.notes.docs.get('a')).toEqual({ text: 'newer elsewhere' });
    expect(phone.engine.getStatus().pending).toBe(0);
  });

  it('stops isolating a refused batch once the engine is stopped', async () => {
    let phone: Device | null = null;
    let pushes = 0;
    const transport: SyncTransport = {
      pull: server.transport().pull,
      push: async () => {
        pushes += 1;
        void phone?.engine.stop();
        throw new SyncError('invalid', 'nope');
      },
    };
    phone = await started(makeDevice(server, 'phone', { transport }));
    for (const id of ['a', 'b', 'c', 'd']) phone.notes.set(id, { id });
    await elapse(PUSH_DEBOUNCE_MS * 2);
    expect(pushes).toBe(1);
  });
});

describe('collections added by an app update', () => {
  it('pulls everything again so documents skipped by older builds arrive', async () => {
    server.seed(seedDoc('n1', { text: 'note' }));
    server.seed({ ...seedDoc('t1', { tip: 'from the server' }), collection: 'tips' });
    const storage = memoryLedgerStorage();
    const notes = memoryAdapter('notes');
    const tips = memoryAdapter('tips');
    const build = (adapters: MemoryAdapter[]) =>
      createSyncEngine({
        userId: 'user-1',
        deviceId: 'phone',
        transport: server.transport(),
        adapters,
        storage,
        random: () => 1,
      });

    const older = build([notes]);
    await older.start();
    await settle();
    await older.stop();
    expect(storage.current?.known).toEqual(['notes']);

    // The newer build ships a default document with the same id as the account's.
    tips.docs.set('t1', { tip: 'local default' });
    server.pullCalls = [];
    const newer = build([notes, tips]);
    await newer.start();
    await settle();
    await elapse(PUSH_DEBOUNCE_MS);

    expect(server.pullCalls[0]).toMatchObject({ since: 0 });
    expect(tips.docs.get('t1')).toEqual({ tip: 'from the server' });
    expect(server.get('tips', 't1')?.data).toEqual({ tip: 'from the server' });
    expect(storage.current?.known).toEqual(['notes', 'tips']);
    await newer.stop();
  });
});
