import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { BirthYearScreen } from './BirthYearScreen';
import { NotEligibleScreen } from './NotEligibleScreen';

const mockSupabase = {
  rpc: jest.fn(),
  signOut: jest.fn(async (_options?: unknown) => ({ error: null })),
};

jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: mockSupabase.rpc,
    auth: { signOut: mockSupabase.signOut },
  }),
}));

const thisYear = new Date().getFullYear();
const initial = useSessionStore.getState();

function accountStatus(birthYear: number | null) {
  const age = birthYear == null ? null : Math.max(0, thisYear - birthYear - 1);
  return {
    data: {
      user_id: 'kid-1',
      handle: 'cook_1',
      has_birth_year: age != null,
      age_years: age,
      is_adult: age != null && age >= 18,
      is_underage: age != null && age < 13,
      suspended_until: null,
      roles: [],
    },
    error: null,
  };
}

/** Server double: remembers the year and deletes on request. */
function serveAccount(initialYear: number | null) {
  let year = initialYear;
  mockSupabase.rpc.mockImplementation(async (name: string, args?: { p_birth_year: number }) => {
    if (name === 'set_birth_year' && args) year = args.p_birth_year;
    if (name === 'delete_my_account') return { data: { deleted: true }, error: null };
    return accountStatus(year);
  });
}

beforeEach(() => {
  useSessionStore.setState(initial, true);
  useSessionStore
    .getState()
    .signedIn({ userId: 'kid-1', birthYear: null, onboardingComplete: false });
});

describe('BirthYearScreen', () => {
  it('saves the confirmed year on the server, then in the session', async () => {
    serveAccount(null);
    await renderWithTheme(<BirthYearScreen />);
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.press(screen.getByRole('radio', { name: '1990s' }));
    await user.press(screen.getByRole('radio', { name: '1994' }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: 'Yes, I was born in 1994' }));
    expect(mockSupabase.rpc).toHaveBeenCalledWith('set_birth_year', { p_birth_year: 1994 });
    expect(useSessionStore.getState().birthYear).toBe(1994);
  });

  it('explains when the year cannot be saved offline', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Network request failed' },
    });
    await renderWithTheme(<BirthYearScreen />);
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: '1990s' }));
    await user.press(screen.getByRole('radio', { name: '1991' }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: 'Yes, I was born in 1991' }));
    expect(await screen.findByText(/You’re offline/)).toBeOnTheScreen();
    expect(useSessionStore.getState().birthYear).toBeNull();
  });
});

describe('under-13 path', () => {
  it('records the year, deletes the account and signs out', async () => {
    const kidYear = thisYear - 10;
    serveAccount(null);
    await renderWithTheme(<BirthYearScreen />);
    const user = userEvent.setup();
    const decade = Math.floor(kidYear / 10) * 10;
    await user.press(screen.getByRole('radio', { name: `${decade}s` }));
    await user.press(screen.getByRole('radio', { name: String(kidYear) }));
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await user.press(screen.getByRole('button', { name: `Yes, I was born in ${kidYear}` }));
    expect(useSessionStore.getState()).toMatchObject({
      birthYear: kidYear,
      status: 'needsSetup',
    });

    await renderWithTheme(<NotEligibleScreen />);
    expect(screen.getByText('Famara is for ages 13 and up')).toBeOnTheScreen();
    await waitFor(() =>
      expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_my_account', undefined),
    );
    await waitFor(() => expect(mockSupabase.signOut).toHaveBeenCalled());
  });

  it('never deletes on the device’s word alone', async () => {
    // This device thinks the person is 10, but the server has an adult on record.
    serveAccount(thisYear - 31);
    useSessionStore.getState().setBirthYear(thisYear - 10);
    await renderWithTheme(<NotEligibleScreen />);
    await waitFor(() => expect(useSessionStore.getState().birthYear).toBe(thisYear - 31));
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('delete_my_account', undefined);
    expect(mockSupabase.signOut).not.toHaveBeenCalled();
  });

  it('asks someone who may still be 12 to come back next year, without deleting', async () => {
    serveAccount(thisYear - 13);
    useSessionStore.getState().setBirthYear(thisYear - 13);
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithTheme(<NotEligibleScreen />);
    expect(screen.getByText(new RegExp(`January 1, ${thisYear + 1}`))).toBeOnTheScreen();
    expect(mockSupabase.rpc).not.toHaveBeenCalledWith('delete_my_account', undefined);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(alert).toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => buttons.find((button) => button.style === 'destructive')?.onPress?.());
    await waitFor(() =>
      expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_my_account', undefined),
    );
  });
});
