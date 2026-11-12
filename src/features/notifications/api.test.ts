import { olderThanFilter } from './api';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

describe('olderThanFilter', () => {
  it('selects entries strictly older than the cursor, breaking ties by id', () => {
    expect(olderThanFilter({ createdAt: '2026-11-10T10:00:00.123+00:00', id: 'abc' })).toBe(
      'created_at.lt."2026-11-10T10:00:00.123+00:00",and(created_at.eq."2026-11-10T10:00:00.123+00:00",id.lt.abc)',
    );
  });
});
