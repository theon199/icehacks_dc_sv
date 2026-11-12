import { COOK_TIMER_NOTIFICATION_KIND, cookTimerTapUrl } from './timerNotification';

describe('cookTimerTapUrl', () => {
  it('returns the cook route of a timer notification', () => {
    expect(cookTimerTapUrl({ kind: COOK_TIMER_NOTIFICATION_KIND, url: '/cook/mealdb%3A1' })).toBe(
      '/cook/mealdb%3A1',
    );
  });

  it('ignores other notifications and anything that is not a cook route', () => {
    expect(cookTimerTapUrl(null)).toBeNull();
    expect(cookTimerTapUrl('cook_timer')).toBeNull();
    expect(cookTimerTapUrl({ kind: 'comment', url: '/cook/x' })).toBeNull();
    expect(cookTimerTapUrl({ kind: COOK_TIMER_NOTIFICATION_KIND })).toBeNull();
    expect(cookTimerTapUrl({ kind: COOK_TIMER_NOTIFICATION_KIND, url: '/settings' })).toBeNull();
    expect(
      cookTimerTapUrl({ kind: COOK_TIMER_NOTIFICATION_KIND, url: 'https://example.org/cook/x' }),
    ).toBeNull();
    expect(cookTimerTapUrl({ kind: COOK_TIMER_NOTIFICATION_KIND, url: '/cook/x/done' })).toBeNull();
  });
});
