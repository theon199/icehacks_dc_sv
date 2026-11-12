import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useSessionStore } from '@/features/auth';
import {
  AccountError,
  deleteMyAccount,
  fetchAccountStatus,
  identityFor,
  saveBirthYear,
  type AccountStatus,
} from '@/features/auth/accountApi';
import { signOut } from '@/features/auth/authActions';
import { renderWithTheme } from '@/test/render';

import { BirthYearScreen } from './BirthYearScreen';
import { NotEligibleScreen } from './NotEligibleScreen';

// The screens are tested against a fake of the account API, not the network client below it.
jest.mock('@/features/auth/accountApi', () => ({
  ...jest.requireActual<object>('@/features/auth/accountApi'),
  fetchAccountStatus: jest.fn(),
  saveBirthYear: jest.fn(),
  deleteMyAccount: jest.fn(),
  identityFor: jest.fn(),
}));
jest.mock('@/features/auth/authActions', () => ({
  ...jest.requireActual<object>('@/features/auth/authActions'),
  signOut: jest.fn(async () => undefined),
}));

const KID = 'kid-1';
const currentYear = new Date().getFullYear();
const startingState = useSessionStore.getState();

/** What the server has on record for the test account. */
const record = { birthYear: null as number | null };

function statusOnRecord(): AccountStatus {
  const age = record.birthYear == null ? null : Math.max(0, currentYear - record.birthYear - 1);
  return {
    userId: KID,
    hasBirthYear: age != null,
    ageYears: age,
    isAdult: age != null && age >= 18,
    isUnderage: age != null && age < 13,
  };
}

const status = jest.mocked(fetchAccountStatus);
const save = jest.mocked(saveBirthYear);
const remove = jest.mocked(deleteMyAccount);
const identity = jest.mocked(identityFor);
const leave = jest.mocked(signOut);

async function pickYear(year: number) {
  const user = userEvent.setup();
  await user.press(screen.getByTestId(`decade-${Math.floor(year / 10) * 10}`));
  await user.press(screen.getByTestId(`year-${year}`));
  await user.press(screen.getByTestId('birth-year-continue'));
  await user.press(screen.getByTestId('birth-year-confirm'));
}

beforeEach(() => {
  record.birthYear = null;
  status.mockImplementation(async () => statusOnRecord());
  save.mockImplementation(async (year) => {
    record.birthYear = year;
    return statusOnRecord();
  });
  remove.mockResolvedValue(undefined);
  identity.mockImplementation(async (userId) => ({ userId, accessToken: `token-for-${userId}` }));
  useSessionStore.setState(startingState, true);
  useSessionStore.getState().signedIn({ userId: KID, birthYear: null, onboardingComplete: false });
});

describe('BirthYearScreen', () => {
  it('keeps Continue disabled until a year is picked', async () => {
    await renderWithTheme(<BirthYearScreen />);
    expect(screen.getByTestId('birth-year-continue')).toBeDisabled();
  });

  it('stores the confirmed year on the server before the session', async () => {
    await renderWithTheme(<BirthYearScreen />);
    await pickYear(1994);
    expect(save).toHaveBeenCalledWith(1994, { userId: KID, accessToken: `token-for-${KID}` });
    expect(record.birthYear).toBe(1994);
    expect(useSessionStore.getState().birthYear).toBe(1994);
  });

  it('keeps the year on the account that entered it when another one signs in mid-save', async () => {
    let reply: (value: AccountStatus) => void = () => undefined;
    save.mockImplementationOnce(
      () =>
        new Promise<AccountStatus>((resolve) => {
          reply = resolve;
        }),
    );
    await renderWithTheme(<BirthYearScreen />);
    await pickYear(1990);
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(1990, { userId: KID, accessToken: `token-for-${KID}` });

    await act(async () => {
      useSessionStore
        .getState()
        .signedIn({ userId: 'someone-else', birthYear: null, onboardingComplete: false });
    });
    record.birthYear = 1990;
    await act(async () => reply(statusOnRecord()));

    expect(useSessionStore.getState()).toMatchObject({ userId: 'someone-else', birthYear: null });
  });

  it('saves nothing when the account changed before the request was sent', async () => {
    identity.mockRejectedValueOnce(new AccountError('account_changed', 'changed'));
    await renderWithTheme(<BirthYearScreen />);
    await pickYear(1992);
    expect(await screen.findByText(/A different account is signed in now/)).toBeOnTheScreen();
    expect(save).not.toHaveBeenCalled();
    expect(useSessionStore.getState().birthYear).toBeNull();
  });

  it('explains an offline failure and keeps the session unchanged', async () => {
    save.mockRejectedValue(new AccountError('offline', 'offline'));
    await renderWithTheme(<BirthYearScreen />);
    await pickYear(1991);
    expect(await screen.findByText(/You’re offline/)).toBeOnTheScreen();
    expect(useSessionStore.getState().birthYear).toBeNull();
  });
});

describe('NotEligibleScreen', () => {
  it('deletes the checked account of someone under 13, then signs them out', async () => {
    const tenYearsAgo = currentYear - 10;
    await renderWithTheme(<BirthYearScreen />);
    await pickYear(tenYearsAgo);
    expect(useSessionStore.getState()).toMatchObject({
      birthYear: tenYearsAgo,
      status: 'needsSetup',
    });

    await renderWithTheme(<NotEligibleScreen />);
    expect(screen.getByText('Famara is for ages 13 and up')).toBeOnTheScreen();
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith({ userId: KID, accessToken: `token-for-${KID}` }),
    );
    await waitFor(() => expect(leave).toHaveBeenCalled());
  });

  it('follows the server when this device alone thinks the person is under 13', async () => {
    record.birthYear = currentYear - 31;
    useSessionStore.getState().setBirthYear(currentYear - 10);
    await renderWithTheme(<NotEligibleScreen />);
    await waitFor(() => expect(useSessionStore.getState().birthYear).toBe(currentYear - 31));
    expect(remove).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it('deletes nothing when another account signs in during the check', async () => {
    record.birthYear = currentYear - 10;
    useSessionStore.getState().setBirthYear(currentYear - 10);
    let reply: (value: AccountStatus) => void = () => undefined;
    status.mockImplementationOnce(
      () =>
        new Promise<AccountStatus>((resolve) => {
          reply = resolve;
        }),
    );
    await renderWithTheme(<NotEligibleScreen />);
    await waitFor(() => expect(status).toHaveBeenCalled());

    await act(async () => {
      useSessionStore
        .getState()
        .signedIn({ userId: 'grown-up', birthYear: 1980, onboardingComplete: true });
    });
    await act(async () => reply(statusOnRecord()));

    expect(remove).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it('asks someone who may still be 12 to wait, and deletes only when they confirm', async () => {
    record.birthYear = currentYear - 13;
    useSessionStore.getState().setBirthYear(currentYear - 13);
    await renderWithTheme(<NotEligibleScreen />);
    expect(screen.getByText(new RegExp(`January 1, ${currentYear + 1}`))).toBeOnTheScreen();
    expect(remove).not.toHaveBeenCalled();

    const confirmDialog = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _body, choices) => {
        choices?.find((choice) => choice.style === 'destructive')?.onPress?.();
      });
    await userEvent.setup().press(screen.getByTestId('not-yet-delete'));
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ userId: KID })),
    );
  });
});
