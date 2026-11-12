/**
 * Which optional pushes the account wants. The choice is stored on the server (through the `push`
 * edge function) because that is where pushes are sent from: a category that is off is never
 * handed to the push service, whichever device the account is signed in on. Moderation outcomes,
 * appeal decisions and badges are not optional.
 */
import { z } from 'zod';

import { callFunction } from '@/lib/api/client';

export interface PushCategories {
  /** Likes, comments and replies on the person's posts. */
  social: boolean;
  /** New followers and accepted friend invites. */
  follows: boolean;
}

export type PushCategory = keyof PushCategories;

const CategoriesResponse = z.object({
  categories: z.object({ social: z.boolean(), follows: z.boolean() }),
});

/** The account's current choices; both are off until the person turns them on. */
export async function fetchPushCategories(): Promise<PushCategories> {
  const { categories } = await callFunction('push', { action: 'categories' }, CategoriesResponse);
  return categories;
}

/** Changes the given categories, leaving the others as they are, and returns the result. */
export async function savePushCategories(change: Partial<PushCategories>): Promise<PushCategories> {
  const { categories } = await callFunction(
    'push',
    { action: 'categories', ...change },
    CategoriesResponse,
  );
  return categories;
}
