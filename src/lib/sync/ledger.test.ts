import Storage from 'expo-sqlite/kv-store';

import { storageKey } from '@/lib/storage/kv';

import {
  freshLedger,
  kvLedgerStorage,
  LEDGER_HEADER_KEY,
  ledgerBucketKey,
  type Ledger,
} from './ledger';

function sampleLedger(): Ledger {
  const ledger = freshLedger('user-1');
  ledger.cursor = 12;
  ledger.bootstrapped = true;
  ledger.known = ['pantry', 'feedback'];
  ledger.docs.pantry = { rice: { u: '2026-11-11T10:00:00.000Z', d: 'phone', h: 'aa', s: true } };
  ledger.docs.feedback = { f1: { u: '2026-11-11T10:00:01.000Z', d: 'phone', h: 'bb', s: false } };
  return ledger;
}

const raw = (key: string) => Storage.getItemSync(storageKey(key));

beforeEach(() => {
  Storage.clearSync();
});

describe('kvLedgerStorage', () => {
  it('stores a header plus one key per collection and reads them back', () => {
    const ledger = sampleLedger();
    kvLedgerStorage.save(ledger, ['pantry', 'feedback']);

    expect(JSON.parse(raw(LEDGER_HEADER_KEY) ?? '{}')).toMatchObject({
      cursor: 12,
      buckets: ['pantry', 'feedback'],
    });
    expect(raw(ledgerBucketKey('pantry'))).toContain('rice');
    expect(kvLedgerStorage.load('user-1')).toEqual(ledger);
    expect(kvLedgerStorage.load('user-2')).toBeNull();
  });

  it('rewrites only the collections it is given', () => {
    const ledger = sampleLedger();
    kvLedgerStorage.save(ledger, ['pantry', 'feedback']);
    const pantryBefore = raw(ledgerBucketKey('pantry'));

    // The kv-store mock records calls; only count the writes made by the second save.
    const write = Storage.setItemSync as jest.Mock;
    write.mockClear();
    ledger.docs.feedback = {
      ...ledger.docs.feedback,
      f2: { u: 'x', d: 'phone', h: 'cc', s: false },
    };
    kvLedgerStorage.save(ledger, ['feedback']);
    expect(write.mock.calls.map(([key]) => key)).toEqual([
      storageKey(ledgerBucketKey('feedback')),
      storageKey(LEDGER_HEADER_KEY),
    ]);
    expect(raw(ledgerBucketKey('pantry'))).toBe(pantryBefore);
    expect(Object.keys(kvLedgerStorage.load('user-1')?.docs.feedback ?? {})).toEqual(['f1', 'f2']);
  });

  it('discards the whole ledger when a bucket is unreadable', () => {
    kvLedgerStorage.save(sampleLedger(), ['pantry', 'feedback']);
    Storage.setItemSync(storageKey(ledgerBucketKey('pantry')), '{"rice":{"u":1}}');
    expect(kvLedgerStorage.load('user-1')).toBeNull();
  });

  it('removes the header and every bucket', () => {
    kvLedgerStorage.save(sampleLedger(), ['pantry', 'feedback']);
    kvLedgerStorage.remove();
    expect(raw(LEDGER_HEADER_KEY)).toBeNull();
    expect(raw(ledgerBucketKey('pantry'))).toBeNull();
    expect(raw(ledgerBucketKey('feedback'))).toBeNull();
  });
});
