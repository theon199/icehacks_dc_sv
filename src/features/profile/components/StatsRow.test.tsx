import { screen } from '@testing-library/react-native';

import type { MyStats } from '@/lib/supabase/database.types';
import { renderWithTheme } from '@/test/render';

import { StatsRow } from './StatsRow';

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
  it('shows each stat as one accessible tile', async () => {
    await renderWithTheme(<StatsRow stats={stats} loading={false} />);
    expect(screen.getByLabelText('12 dishes cooked, 2 this week')).toBeOnTheScreen();
    expect(screen.getByLabelText('4 days in a row, best 6')).toBeOnTheScreen();
    expect(screen.getByLabelText('3 cuisines explored')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 post shared')).toBeOnTheScreen();
    expect(screen.getByLabelText('9 likes received')).toBeOnTheScreen();
  });

  it('lists the most-cooked cuisines', async () => {
    await renderWithTheme(<StatsRow stats={stats} loading={false} />);
    expect(screen.getByLabelText('West African · 7')).toBeOnTheScreen();
    expect(screen.getByLabelText('Indian · 5')).toBeOnTheScreen();
  });

  it('nudges people who have not cooked yet', async () => {
    await renderWithTheme(
      <StatsRow
        stats={{ ...stats, cooked_count: 0, post_count: 0, cuisines: [] }}
        loading={false}
      />,
    );
    expect(screen.getByText(/start your streak/)).toBeOnTheScreen();
  });

  it('shows placeholders while loading', async () => {
    await renderWithTheme(<StatsRow stats={undefined} loading />);
    expect(screen.getByTestId('stats-loading')).toBeOnTheScreen();
  });
});
