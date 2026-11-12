/** Renders Community UI with a fresh QueryClient inside the app's theme providers. Tests only. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { renderWithTheme } from '@/test/render';

export function createTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export async function renderWithClient(ui: ReactElement, client = createTestClient()) {
  const result = await renderWithTheme(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { ...result, client };
}
