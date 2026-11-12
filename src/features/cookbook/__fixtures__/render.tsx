import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { useMealPlanStore, usePreferencesStore, useSavedStore } from '@/stores';
import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

const clients: QueryClient[] = [];

/** Renders Cookbook UI with a fresh query cache inside the app's theme providers. */
export function renderCookbook(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return renderWithTheme(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

export function clearQueryClients() {
  for (const client of clients.splice(0)) client.clear();
}

/** Fresh stores for a person who finished onboarding with no allergens. */
export function resetCookbookStores() {
  useMealPlanStore.getState().reset();
  useSavedStore.getState().reset();
  useToastStore.getState().clear();
  const prefs = usePreferencesStore.getState();
  prefs.reset();
  prefs.update({ householdSize: 2, onboardedAt: '2026-11-01T00:00:00.000Z' });
  prefs.setAllergens([]);
}
