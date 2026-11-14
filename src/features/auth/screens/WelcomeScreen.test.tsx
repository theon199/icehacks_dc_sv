import { screen, userEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { WelcomeScreen } from './WelcomeScreen';

const mockRouter = { push: jest.fn(), replace: jest.fn(), setParams: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useIsFocused: () => true,
}));
// The collage reads the catalog; these tests are about the way in.
jest.mock('../welcome/WelcomeCarousel', () => ({ WelcomeCarousel: () => null }));

beforeEach(() => {
  mockParams = {};
});

describe('WelcomeScreen', () => {
  it('opens the account sheet for a newcomer', async () => {
    await renderWithTheme(<WelcomeScreen />);
    expect(screen.queryByLabelText(/Let’s get you cooking/)).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByLabelText(/Let’s get you cooking/)).toBeOnTheScreen();
  });

  it('greets someone logging back in and can switch to getting started', async () => {
    await renderWithTheme(<WelcomeScreen />);
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByLabelText(/Good to see you again/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('account-sheet-switch'));
    expect(screen.getByLabelText(/Let’s get you cooking/)).toBeOnTheScreen();
  });

  it('opens straight on the log-in form from a link', async () => {
    mockParams = { auth: 'log-in', step: 'email' };
    await renderWithTheme(<WelcomeScreen />);
    expect(screen.getByTestId('sign-in-email')).toBeOnTheScreen();
    expect(screen.getByTestId('sign-in-submit')).toBeOnTheScreen();
  });

  it('forgets the link when the sheet closes', async () => {
    mockParams = { auth: 'get-started' };
    await renderWithTheme(<WelcomeScreen />);
    await userEvent.setup().press(screen.getByTestId('account-sheet-close'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ auth: undefined, step: undefined });
  });
});
