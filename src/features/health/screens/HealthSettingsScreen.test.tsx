import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';

import { DAY_MS, HOUR_MS, computeDayContext, type GlucosePair } from '@/domain/health';
import { renderWithTheme } from '@/test/render';

import { healthCopy } from '../copy';
import { getDishTitles } from '../deps';
import { healthKitSource } from '../healthKit';
import { useHealthStore } from '../healthStore';
import { HealthSettingsScreen } from './HealthSettingsScreen';

jest.mock('../healthKit', () => ({
  healthKitSource: {
    platform: jest.fn(async () => 'available'),
    requestStatus: jest.fn(async () => 'answered'),
    requestAccess: jest.fn(),
  },
}));
jest.mock('../deps', () => ({ getDishTitles: jest.fn() }));
jest.mock('../refresh', () => ({
  refreshHealth: jest.fn(async () => 'too_soon'),
  removeSyncedHealth: jest.fn(async () => true),
}));

const NOW = Date.now();

function pairs(): GlucosePair[] {
  // Twelve days, alternating a steady soup and a dish with a bigger rise.
  return Array.from({ length: 12 }, (_, i) => {
    const startedAt = NOW - (i + 1) * DAY_MS;
    const soup = i % 2 === 0;
    return {
      mealId: `m${i}`,
      recipeRef: soup ? 'mealdb:soup' : 'mealdb:noodles',
      localDate: new Date(startedAt).toISOString().slice(0, 10),
      startedAt,
      baselineMgdl: 100,
      peakMgdl: soup ? 110 : 160,
      riseMgdl: soup ? 10 : 60,
      minutesToPeak: 40,
      sampleCount: 24,
    };
  });
}

async function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await renderWithTheme(
    <QueryClientProvider client={client}>
      <HealthSettingsScreen />
    </QueryClientProvider>,
  );
  await act(async () => {});
}

beforeEach(() => {
  useHealthStore.getState().reset();
  jest.mocked(getDishTitles).mockResolvedValue({ 'mealdb:soup': 'Red lentil soup' });
  jest.mocked(healthKitSource.platform).mockResolvedValue('available');
});

describe('HealthSettingsScreen', () => {
  it('shows only the connection card and disclaimer while Health is off', async () => {
    await renderScreen();
    expect(screen.getByText(healthCopy.connection.states.off)).toBeOnTheScreen();
    expect(screen.queryByTestId('health-day-context')).not.toBeOnTheScreen();
    expect(screen.getByText(healthCopy.disclaimer)).toBeOnTheScreen();
  });

  it('shows today and the dishes that kept readings steadier', async () => {
    const context = computeDayContext({
      workouts: [{ kind: 'strength', start: NOW - 2 * HOUR_MS, end: NOW - HOUR_MS }],
      sleep: [{ start: NOW - 14 * HOUR_MS, end: NOW - 9 * HOUR_MS }],
      now: NOW,
    });
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().applyRefresh({ at: NOW, dayContext: context, glucosePairs: pairs() });
    await renderScreen();

    expect(screen.getByText(healthCopy.day.activity.very_active)).toBeOnTheScreen();
    expect(screen.getByText(healthCopy.day.shortNight)).toBeOnTheScreen();
    expect(screen.getByText(healthCopy.day.suggestions.more_protein)).toBeOnTheScreen();
    expect(screen.getByText(healthCopy.day.suggestions.lighter_dinner)).toBeOnTheScreen();

    expect(screen.getByText(healthCopy.glucose.steadierTitle)).toBeOnTheScreen();
    expect(await screen.findByText('Red lentil soup')).toBeOnTheScreen();
    expect(screen.getByText(healthCopy.glucose.dishLine(6, 10))).toBeOnTheScreen();
  });

  it('shows progress while glucose data is still being collected', async () => {
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().applyRefresh({ at: NOW, glucosePairs: pairs().slice(0, 5) });
    await renderScreen();
    expect(screen.getByText(healthCopy.glucose.collecting(5, 12))).toBeOnTheScreen();
    expect(screen.queryByText(healthCopy.glucose.steadierTitle)).not.toBeOnTheScreen();
  });
});
