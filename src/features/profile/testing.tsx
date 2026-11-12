/**
 * Test helpers for the profile feature: renders with a fresh React Query client and the theme.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

export async function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const result = await renderWithTheme(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { client, result };
}

export function signInForTest(userId = TEST_USER_ID): void {
  useSessionStore.getState().signedIn({
    userId,
    birthYear: 1990,
    onboardingComplete: true,
    aiConsent: false,
  });
}
