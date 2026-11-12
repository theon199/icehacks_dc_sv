import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';
import { Text } from '@/ui';

import { ModeratorGate } from './components/ModeratorGate';
import { hasModeratorRole } from './queries';

const mockSelect = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  supabase: { from: () => ({ select: (...args: unknown[]) => mockSelect(...args) }) },
}));

const initialSession = useSessionStore.getState();
const clients: QueryClient[] = [];

function renderGate(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderWithTheme(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  useSessionStore.setState(
    { status: 'ready', userId: 'user-1', birthYear: 1990, onboardingComplete: true },
    false,
  );
  mockSelect.mockReset();
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  useSessionStore.setState(initialSession, true);
});

describe('hasModeratorRole', () => {
  it('accepts moderators and admins only', () => {
    expect(hasModeratorRole(['moderator'])).toBe(true);
    expect(hasModeratorRole(['admin'])).toBe(true);
    expect(hasModeratorRole([])).toBe(false);
    expect(hasModeratorRole(['member'])).toBe(false);
    expect(hasModeratorRole(undefined)).toBe(false);
  });
});

describe('ModeratorGate', () => {
  const tools = <Text>Review tools</Text>;

  it('shows the tools to moderators', async () => {
    mockSelect.mockResolvedValue({ data: [{ role: 'moderator' }], error: null });
    await renderGate(<ModeratorGate>{tools}</ModeratorGate>);
    expect(await screen.findByText('Review tools')).toBeTruthy();
    expect(mockSelect).toHaveBeenCalledWith('role');
  });

  it('keeps the tools hidden from everyone else', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });
    await renderGate(<ModeratorGate>{tools}</ModeratorGate>);
    expect(await screen.findByTestId('moderator-gate-denied')).toBeTruthy();
    expect(screen.queryByText('Review tools')).toBeNull();
  });

  it('fails closed with a retry when the roles cannot be read', async () => {
    mockSelect.mockResolvedValueOnce({ data: null, error: { code: '', message: 'offline' } });
    await renderGate(<ModeratorGate>{tools}</ModeratorGate>);
    await waitFor(() => expect(screen.getByTestId('moderator-gate-error')).toBeTruthy());
    expect(screen.queryByText('Review tools')).toBeNull();
    expect(screen.queryByTestId('moderator-gate-denied')).toBeNull();

    mockSelect.mockResolvedValueOnce({ data: [{ role: 'admin' }], error: null });
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Review tools')).toBeTruthy();
  });
});
