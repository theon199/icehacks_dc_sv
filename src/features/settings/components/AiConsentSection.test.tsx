import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

import { AI_TERMS_VERSION } from '../aiConsent';
import { AiConsentSection } from './AiConsentSection';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({ auth: { updateUser: mockUpdateUser } }),
}));

const thisYear = new Date().getFullYear();

function signIn(aiConsent: boolean) {
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: thisYear - 31,
    onboardingComplete: true,
    aiConsent,
  });
}

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('AI consent switch', () => {
  it('records agreement on the account before opening AI features', async () => {
    signIn(false);
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    await renderWithTheme(<AiConsentSection />);
    await fireEvent(screen.getByTestId('settings-ai-consent'), 'valueChange', true);

    await waitFor(() => expect(useSessionStore.getState().aiConsent).toBe(true));
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: {
        ai_consent: {
          granted: true,
          terms_version: AI_TERMS_VERSION,
          decided_at: expect.any(String),
        },
      },
    });
    expect(screen.getByTestId('settings-ai-consent')).toHaveProp('value', true);
  });

  it('keeps AI off when the agreement cannot be saved', async () => {
    signIn(false);
    mockUpdateUser.mockResolvedValue({ data: {}, error: { message: 'offline' } });
    await renderWithTheme(<AiConsentSection />);
    await fireEvent(screen.getByTestId('settings-ai-consent'), 'valueChange', true);

    await waitFor(() => expect(useToastStore.getState().queue[0]?.tone).toBe('danger'));
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('withdraws on this device straight away, even if the account cannot be updated', async () => {
    signIn(true);
    mockUpdateUser.mockRejectedValue(new Error('offline'));
    await renderWithTheme(<AiConsentSection />);
    await fireEvent(screen.getByTestId('settings-ai-consent'), 'valueChange', false);

    expect(useSessionStore.getState().aiConsent).toBe(false);
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: { ai_consent: expect.objectContaining({ granted: false }) },
    });
    await waitFor(() => expect(screen.getByTestId('settings-ai-consent')).toBeEnabled());
  });
});
