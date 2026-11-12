import type { NotificationItem } from './model';
import { dayTitle, toInboxRows } from './sections';

function at(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour);
}

function item(id: string, created: Date): NotificationItem {
  return {
    id,
    kind: 'follow',
    actor_id: 'a',
    actor_handle: 'a',
    actor_display_name: 'A',
    actor_avatar_path: null,
    post_id: null,
    comment_id: null,
    data: {},
    read_at: null,
    created_at: created.toISOString(),
  };
}

const now = at(2026, 11, 11, 9);

describe('dayTitle', () => {
  it('names recent days relative to now', () => {
    expect(dayTitle(at(2026, 11, 11, 0), now, 'en-US')).toBe('Today');
    expect(dayTitle(at(2026, 11, 10, 23), now, 'en-US')).toBe('Yesterday');
    expect(dayTitle(at(2026, 11, 6), now, 'en-US')).toBe('Friday');
  });

  it('uses the date beyond a week, adding the year only when it differs', () => {
    expect(dayTitle(at(2026, 10, 2), now, 'en-US')).toBe('October 2');
    expect(dayTitle(at(2025, 12, 31), now, 'en-US')).toBe('December 31, 2025');
  });

  it('treats a timestamp slightly in the future as today', () => {
    expect(dayTitle(at(2026, 11, 11, 10), now, 'en-US')).toBe('Today');
  });
});

describe('toInboxRows', () => {
  it('inserts one header per day ahead of that day’s entries', () => {
    const rows = toInboxRows(
      [
        item('1', at(2026, 11, 11, 8)),
        item('2', at(2026, 11, 11, 7)),
        item('3', at(2026, 11, 10, 20)),
        item('4', at(2026, 10, 1)),
      ],
      now,
      'en-US',
    );
    expect(rows.map((row) => (row.type === 'header' ? `# ${row.title}` : row.item.id))).toEqual([
      '# Today',
      '1',
      '2',
      '# Yesterday',
      '3',
      '# October 1',
      '4',
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('returns nothing for an empty inbox', () => {
    expect(toInboxRows([], now)).toEqual([]);
  });
});
