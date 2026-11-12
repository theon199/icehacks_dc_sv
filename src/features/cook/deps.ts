/**
 * The one place cook mode reaches into other feature areas. Each entry degrades to something
 * neutral when the other area has not shipped that piece yet.
 */
import type { Href } from 'expo-router';

import { profileKeys } from '@/features/profile';
import { queryClient } from '@/lib/query/client';

/** What the cook just made, handed to the community composer as a starting draft. */
export interface CookShareDraft {
  recipeId: string;
  rating: number | null;
  /** "What I changed", offered as the post body. */
  note: string;
  /** Compressed local photo, if one was taken. */
  photo: { uri: string; width: number; height: number } | null;
}

/**
 * Route that opens the community composer for this dish. `recipe` is understood today; the
 * composer can pick up the rating, note and photo from the other params as soon as it reads them,
 * and ignores them until then.
 */
export function composeHref(draft: CookShareDraft): Href {
  const params: Record<string, string> = { recipe: draft.recipeId, from: 'cook' };
  if (draft.rating !== null) params.rating = String(draft.rating);
  const note = draft.note.trim();
  if (note) params.note = note.slice(0, 2000);
  if (draft.photo) {
    params.photo = draft.photo.uri;
    params.photoWidth = String(draft.photo.width);
    params.photoHeight = String(draft.photo.height);
  }
  return { pathname: '/compose', params };
}

/**
 * Marks the person's profile stats and badges as out of date after the server accepted a cook, so
 * the profile shows the new count, streak and badges the next time it is on screen.
 */
export function refreshProfileStats(userId: string): void {
  void queryClient.invalidateQueries({ queryKey: profileKeys.statsAll(userId) });
}
