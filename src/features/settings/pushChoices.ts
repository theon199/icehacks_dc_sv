/**
 * What the push-category switches show. The account's categories live on the server, which decides
 * what is sent; this keeps the last answer per account in memory so reopening Settings does not
 * flash every switch off, and so one account's answer is never shown to another.
 *
 * The shared settings store's `social` choice is kept in step, so the synced settings document
 * matches what the server sends.
 */
import { create } from 'zustand';

import { useSettingsStore, type PushCategories } from './deps';

export const NO_PUSH_CATEGORIES: PushCategories = { social: false, follows: false };

interface PushChoicesState {
  byAccount: Readonly<Record<string, PushCategories>>;
}

const usePushChoicesStore = create<PushChoicesState>()(() => ({ byAccount: {} }));

export function usePushChoices(userId: string | null): PushCategories {
  return usePushChoicesStore(
    (s) => (userId ? s.byAccount[userId] : undefined) ?? NO_PUSH_CATEGORIES,
  );
}

export function rememberPushChoices(userId: string, change: Partial<PushCategories>): void {
  usePushChoicesStore.setState((state) => ({
    byAccount: {
      ...state.byAccount,
      [userId]: { ...(state.byAccount[userId] ?? NO_PUSH_CATEGORIES), ...change },
    },
  }));
  if (change.social !== undefined) {
    useSettingsStore.getState().setNotifications({ social: change.social });
  }
}

/** Test hook. */
export function resetPushChoicesForTests(): void {
  usePushChoicesStore.setState({ byAccount: {} });
}
