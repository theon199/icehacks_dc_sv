import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { setAiConsent } from '@/features/settings';
import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

import { AiConsentScreen } from './AiConsentScreen';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => ({ addListener: () => () => undefined, canGoBack: () => true }),
}));
jest.mock('@/features/settings', () => ({
  setAiConsent: jest.fn(),
  useAiConsentSync: () => undefined,
}));

const save = jest.mocked(setAiConsent);
const thisYear = new Date().getFullYear();
const startingState = useSessionStore.getState();

function signIn(age: number, aiConsent = false) {
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent,
  });
}

beforeEach(() => {
  useSessionStore.setState(startingState, true);
  useToastStore.getState().clear();
  mockRouter.canGoBack.mockReturnValue(true);
});

describe('AiConsentScreen', () => {
  it('records agreement and closes the sheet', async () => {
    signIn(30);
    save.mockResolvedValue(undefined);
    await renderWithTheme(<AiConsentScreen />);
    await userEvent.setup().press(screen.getByTestId('ai-consent-agree'));
    expect(save).toHaveBeenCalledWith(true);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('lands on Discover when there is nothing to go back to', async () => {
    signIn(30);
    save.mockResolvedValue(undefined);
    mockRouter.canGoBack.mockReturnValue(false);
    await renderWithTheme(<AiConsentScreen />);
    await userEvent.setup().press(screen.getByTestId('ai-consent-agree'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('stays open and says so when the choice cannot be saved', async () => {
    signIn(30);
    save.mockRejectedValue(new Error('offline'));
    await renderWithTheme(<AiConsentScreen />);
    await userEvent.setup().press(screen.getByTestId('ai-consent-agree'));
    await waitFor(() => expect(useToastStore.getState().queue[0]?.tone).toBe('danger'));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('offers turning AI off once it is on', async () => {
    signIn(30, true);
    save.mockResolvedValue(undefined);
    await renderWithTheme(<AiConsentScreen />);
    expect(screen.getByText('AI features are on')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByTestId('ai-consent-withdraw'));
    expect(save).toHaveBeenCalledWith(false);
  });

  it('only explains the age limit to under-18s', async () => {
    signIn(16);
    await renderWithTheme(<AiConsentScreen />);
    expect(screen.queryByTestId('ai-consent-agree')).not.toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Got it' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});
