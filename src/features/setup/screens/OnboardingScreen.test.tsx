import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { preferences, useSessionStore } from '@/features/auth';
import { clearUserData } from '@/features/auth/deps';
import { renderWithTheme } from '@/test/render';

import { OnboardingScreen } from './OnboardingScreen';

const mockProfileUpdate = jest.fn();

jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { user_metadata: { full_name: 'Ama Mensah' } } } },
      }),
    },
    from: () => ({
      update: (values: unknown) => ({
        eq: async (_column: string, id: string) => {
          mockProfileUpdate(values, id);
          return { error: null };
        },
      }),
    }),
  }),
}));

jest.mock('../deps', () => ({
  loadCuisineOptions: async () => [
    { id: 'thai', region: 'southeast_asia', recipeCount: 12 },
    { id: 'italian', region: 'southern_europe', recipeCount: 30 },
    { id: 'west_african', region: 'sub_saharan_africa', recipeCount: 4 },
  ],
  loadPantryStaples: async () => [
    { id: 'olive_oil', name: 'olive oil', category: 'oil' },
    { id: 'salt', name: 'salt', category: 'spice' },
  ],
}));

const thisYear = new Date().getFullYear();
const initial = useSessionStore.getState();

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return renderWithTheme(
    <Wrapper>
      <OnboardingScreen />
    </Wrapper>,
  );
}

const continueButton = () => screen.getByTestId('onboarding-continue');

beforeEach(() => {
  clearUserData();
  useSessionStore.setState(initial, true);
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    birthYear: thisYear - 35,
    onboardingComplete: false,
  });
});

describe('OnboardingScreen', () => {
  it('walks every question and writes the answers to preferences', async () => {
    await renderScreen();
    const user = userEvent.setup();

    // Name, prefilled from the sign-in provider.
    expect(await screen.findByDisplayValue('Ama')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 10')).toBeOnTheScreen();
    await user.press(continueButton());

    // Cuisines, grouped by region and searchable.
    expect(await screen.findByText('Southeast Asia')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Search cuisines'), 'tha');
    expect(screen.queryByRole('checkbox', { name: 'Italian' })).toBeNull();
    await user.press(screen.getByRole('checkbox', { name: 'Thai' }));
    expect(screen.getByText('1 of 5 chosen')).toBeOnTheScreen();
    await user.press(continueButton());

    // Diet.
    await user.press(await screen.findByRole('checkbox', { name: 'Vegetarian' }));
    await user.press(continueButton());

    // Allergens need an explicit answer.
    expect(await screen.findByText('Any food allergies?')).toBeOnTheScreen();
    expect(continueButton()).toBeDisabled();
    await user.press(screen.getByRole('checkbox', { name: 'Peanuts' }));
    await user.press(continueButton());

    // Goals: skipped.
    expect(await screen.findByText('What are you aiming for?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Skip' }));

    // Time budget.
    await user.press(await screen.findByRole('radio', { name: '30 minutes' }));
    await user.press(continueButton());

    // Effort: skipped.
    expect(await screen.findByText('How much effort feels right?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Skip' }));

    // Household size.
    await user.press(await screen.findByRole('button', { name: 'More people' }));
    expect(screen.getByText('2 people')).toBeOnTheScreen();
    await user.press(continueButton());

    // Pantry starters.
    await user.press(await screen.findByRole('checkbox', { name: 'Olive oil' }));
    await user.press(continueButton());

    // Small appetite mode, then finish.
    await fireEvent(
      await screen.findByRole('switch', { name: 'Small appetite mode' }),
      'valueChange',
      true,
    );
    expect(screen.getByText('Finish')).toBeOnTheScreen();
    await user.press(continueButton());

    expect(preferences.readAnswers('person-1')).toEqual({
      displayName: 'Ama',
      cuisines: ['thai'],
      diets: ['vegetarian'],
      allergens: ['peanut'],
      goals: [],
      maxMinutes: 30,
      effort: null,
      householdSize: 2,
      pantryStaples: ['olive_oil'],
      smallAppetite: true,
    });
    expect(preferences.isOnboardingComplete('person-1')).toBe(true);
    expect(useSessionStore.getState().status).toBe('ready');
    expect(mockProfileUpdate).toHaveBeenCalledWith({ display_name: 'Ama' }, 'person-1');
  });

  it('goes back without losing answers', async () => {
    await renderScreen();
    const user = userEvent.setup();
    await screen.findByDisplayValue('Ama');
    expect(screen.queryByRole('button', { name: 'Previous question' })).toBeNull();
    await user.press(continueButton());
    await user.press(await screen.findByRole('checkbox', { name: 'Italian' }));
    await user.press(screen.getByRole('button', { name: 'Previous question' }));
    expect(await screen.findByDisplayValue('Ama')).toBeOnTheScreen();
    await user.press(continueButton());
    expect(await screen.findByRole('checkbox', { name: 'Italian' })).toBeChecked();
  });

  it('offers no way to skip the allergen question', async () => {
    await renderScreen();
    const user = userEvent.setup();
    await screen.findByDisplayValue('Ama');
    await user.press(continueButton());
    await user.press(screen.getByRole('button', { name: 'Skip' }));
    await user.press(await screen.findByText('I eat everything'));
    expect(await screen.findByText('Any food allergies?')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    await user.press(screen.getByRole('checkbox', { name: 'No food allergies' }));
    expect(continueButton()).toBeEnabled();
  });

  it('tells teenagers that AI features are for adults', async () => {
    useSessionStore.getState().signedIn({
      userId: 'person-2',
      birthYear: thisYear - 16,
      onboardingComplete: false,
    });
    await renderScreen();
    expect(await screen.findByText(/for people 18 and over/)).toBeOnTheScreen();
  });
});
