import { render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui/ThemeProvider';

import { completeCallback, hasSession } from '../authActions';
import { authFailure } from '../authErrors';
import { AuthCallbackScreen } from './AuthCallbackScreen';

const mockRouter = { replace: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../authActions', () => ({ completeCallback: jest.fn(), hasSession: jest.fn() }));

const complete = jest.mocked(completeCallback);

// A wrapper (rather than wrapping the element) keeps the providers in place across rerenders.
function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider scheme="light">{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const show = (params: Record<string, string>) =>
  render(<AuthCallbackScreen params={params} />, { wrapper: Providers });

beforeEach(() => {
  jest.mocked(hasSession).mockResolvedValue(false);
});

describe('AuthCallbackScreen', () => {
  it('handles a fresh link that arrives after an expired one', async () => {
    complete.mockResolvedValueOnce({ ok: false, failure: authFailure('link_expired') });
    const view = await show({ code: 'old-code' });
    expect(await screen.findByText('That link didn’t work')).toBeOnTheScreen();

    complete.mockResolvedValueOnce({ ok: true, value: { recovery: true } });
    await view.rerender(<AuthCallbackScreen params={{ code: 'new-code' }} />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/auth/reset-password'));
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'exchange', code: 'new-code' }),
    );
  });

  it('uses each link only once across re-renders', async () => {
    complete.mockResolvedValue({ ok: true, value: { recovery: false } });
    const view = await show({ code: 'same' });
    await view.rerender(<AuthCallbackScreen params={{ code: 'same' }} />);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
