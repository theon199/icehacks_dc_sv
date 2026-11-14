import { screen } from '@testing-library/react-native';

import { cookWeek } from '@/domain/plan';
import type { MyStats } from '@/lib/supabase/database.types';
import { renderWithTheme } from '@/test/render';

import { StatsRow } from './StatsRow';
import { StreakSlab } from './StreakSlab';

const stats: MyStats = {
  cooked_count: 12,
  cooked_this_week: 2,
  current_streak: 4,
  longest_streak: 6,
  last_cooked_at: '2026-11-10T18:00:00Z',
  cuisine_count: 3,
  cuisines: [
    { cuisine: 'indian', count: 5 },
    { cuisine: 'west_african', count: 7 },
  ],
  post_count: 1,
  likes_received: 9,
  badges: [],
};

describe('StatsRow', () => {
  it('shows each total as one accessible tile, leaving the streak to its own card', async () => {
    await renderWithTheme(<StatsRow stats={stats} loading={false} />);
    expect(screen.getByLabelText('12 dishes cooked, 2 this week')).toBeOnTheScreen();
    expect(screen.queryByLabelText('4 days in a row, best 6')).toBeNull();
    expect(screen.getByLabelText('3 cuisines explored')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 post shared')).toBeOnTheScreen();
    expect(screen.getByLabelText('9 likes received')).toBeOnTheScreen();
  });

  it('lists the most-cooked cuisines', async () => {
    await renderWithTheme(<StatsRow stats={stats} loading={false} />);
    expect(screen.getByLabelText('West African · 7')).toBeOnTheScreen();
    expect(screen.getByLabelText('Indian · 5')).toBeOnTheScreen();
  });

  it('shows placeholders while loading', async () => {
    await renderWithTheme(<StatsRow stats={undefined} loading />);
    expect(screen.getByTestId('stats-loading')).toBeOnTheScreen();
  });
});

describe('StreakSlab', () => {
  it('reads the streak as one sentence, with the best run and this week beside it', async () => {
    await renderWithTheme(<StreakSlab stats={stats} />);
    expect(screen.getByLabelText('4 days in a row, best 6')).toBeOnTheScreen();
    expect(screen.getByText('Best 6 days · 2 cooked this week')).toBeOnTheScreen();
  });

  it('nudges people who have not cooked yet', async () => {
    await renderWithTheme(
      <StreakSlab
        stats={{ ...stats, cooked_count: 0, current_streak: 0, longest_streak: 0, post_count: 0 }}
      />,
    );
    expect(screen.getByLabelText('0 days in a row')).toBeOnTheScreen();
    expect(screen.getByText(/start your streak/)).toBeOnTheScreen();
  });
});

describe('StreakSlab week dots', () => {
  it('reads the cooked days of this week as one sentence', async () => {
    const week = cookWeek('2026-11-14', ['2026-11-10', '2026-11-14']);
    await renderWithTheme(<StreakSlab stats={stats} week={week} />);
    expect(screen.getByLabelText('Cooked this week on Tuesday, Saturday')).toBeOnTheScreen();
  });

  it('leaves the row out until the week loads', async () => {
    await renderWithTheme(<StreakSlab stats={stats} />);
    expect(screen.queryByTestId('profile-streak-week')).toBeNull();
  });
});
