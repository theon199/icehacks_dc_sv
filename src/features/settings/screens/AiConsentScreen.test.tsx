import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

import { resetAiConsentForTests } from '../aiConsent';
import { AiConsentScreen } from './AiConsentScreen';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const mockAuth = { updateUser: jest.fn(), getUser: jest.fn() };
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuth }) }));

const thisYear = new Date().getFullYear();

function signIn(age: number, aiConsent = false) {
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: thisYear - age - 1,
    onboardingComplete: true,
    aiConsent,
  });
}

beforeEach(() => {
  resetAiConsentForTests();
  useToastStore.getState().clear();
  mockRouter.canGoBack.mockReturnValue(true);
  // No account record yet, so reconciling leaves the local answer alone.
  mockAuth.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', user_metadata: {} } },
    error: null,
  });
});

describe('AiConsentScreen', () => {
  it('records agreement on the account, opens AI and closes the sheet', async () => {
    signIn(30);
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    await renderWithTheme(<AiConsentScreen />);
    await user.press(screen.getByTestId('ai-consent-agree'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      data: { ai_consent: expect.objectContaining({ granted: true }) },
    });
    expect(useSessionStore.getState().aiConsent).toBe(true);
  });

  it('lands on Discover when there is no screen to go back to', async () => {
    signIn(30);
    mockRouter.canGoBack.mockReturnValue(false);
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    await renderWithTheme(<AiConsentScreen />);
    await user.press(screen.getByTestId('ai-consent-agree'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('stays open and keeps AI off when agreement cannot be saved', async () => {
    signIn(30);
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: { message: 'offline' } });
    const user = userEvent.setup();
    await renderWithTheme(<AiConsentScreen />);
    await user.press(screen.getByTestId('ai-consent-agree'));

    await waitFor(() => expect(useToastStore.getState().queue[0]?.tone).toBe('danger'));
    expect(useSessionStore.getState().aiConsent).toBe(false);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('only explains the age limit to under-18s', async () => {
    signIn(16);
    const user = userEvent.setup();
    await renderWithTheme(<AiConsentScreen />);
    expect(screen.queryByTestId('ai-consent-agree')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Got it' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });
});
