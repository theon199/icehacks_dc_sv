/**
 * Compose rules: what a draft needs before it can be published, and how it turns into the publish
 * request. Limits mirror the database constraints so most mistakes are caught before the network.
 */
import { z } from 'zod';

import { postKindSchema, type PostKind } from '../api/schemas';
import type { PublishMediaInput, PublishPostInput } from '../deps';

export const COMPOSE_LIMITS = {
  title: 120,
  body: 2000,
  photos: 4,
  /** Longest edge of an uploaded photo, in pixels. */
  photoEdge: 1600,
  /** JPEG quality for uploaded photos. */
  photoQuality: 0.8,
} as const;

export const draftPhotoSchema = z.object({
  /** Local file picked from the library or camera. */
  uri: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type DraftPhoto = z.infer<typeof draftPhotoSchema>;

export const composeDraftSchema = z.object({
  kind: postKindSchema,
  recipeId: z.string().nullable(),
  recipeTitle: z.string().nullable(),
  /** The post this remix builds on, when started from someone's post. */
  parentPostId: z.string().nullable(),
  parentTitle: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
  photos: z.array(draftPhotoSchema).max(COMPOSE_LIMITS.photos),
});
export type ComposeDraft = z.infer<typeof composeDraftSchema>;

export const emptyDraft: ComposeDraft = {
  kind: 'cook',
  recipeId: null,
  recipeTitle: null,
  parentPostId: null,
  parentTitle: null,
  title: '',
  body: '',
  rating: null,
  photos: [],
};

export type DraftField = 'recipe' | 'title' | 'body' | 'rating' | 'photos';
export type DraftErrors = Partial<Record<DraftField, string>>;

export const KIND_COPY: Record<PostKind, { label: string; hint: string }> = {
  cook: { label: 'I cooked it', hint: 'Share a photo of a recipe you made.' },
  remix: { label: 'My remix', hint: 'Show how you changed a recipe.' },
  tip: { label: 'Kitchen tip', hint: 'A trick or swap that helps others cook.' },
};

/** Whether a draft has anything worth keeping (used to decide whether to ask before discarding). */
export function isDraftEmpty(draft: ComposeDraft): boolean {
  return (
    draft.recipeId == null &&
    draft.title.trim() === '' &&
    draft.body.trim() === '' &&
    draft.rating == null &&
    draft.photos.length === 0
  );
}

export function validateDraft(draft: ComposeDraft): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  const body = draft.body.trim();

  if (draft.kind !== 'tip' && !draft.recipeId) {
    errors.recipe = 'Pick the recipe this is about.';
  }
  if (title.length === 0) errors.title = 'Give your post a title.';
  else if (title.length > COMPOSE_LIMITS.title) {
    errors.title = `Keep the title under ${COMPOSE_LIMITS.title} characters.`;
  }
  if (body.length > COMPOSE_LIMITS.body) {
    errors.body = `Notes can be up to ${COMPOSE_LIMITS.body} characters.`;
  } else if (draft.kind === 'tip' && body.length === 0) {
    errors.body = 'Write the tip you want to share.';
  } else if (draft.kind === 'remix' && body.length === 0) {
    errors.body = 'Say what you changed so others can try it.';
  }
  if (
    draft.rating != null &&
    (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5)
  ) {
    errors.rating = 'Ratings go from 1 to 5 stars.';
  }
  if (draft.photos.length > COMPOSE_LIMITS.photos) {
    errors.photos = `Up to ${COMPOSE_LIMITS.photos} photos per post.`;
  } else if (draft.kind === 'cook' && draft.photos.length === 0) {
    errors.photos = 'Add a photo of what you cooked.';
  }
  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The publish request for a valid draft whose photos are already uploaded (same order). */
export function buildPublishInput(
  draft: ComposeDraft,
  media: readonly PublishMediaInput[],
): PublishPostInput {
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    body: draft.body.trim(),
    // Tips may optionally point at a recipe; cooks and remixes always do.
    recipeRef: draft.recipeId,
    rating: draft.kind === 'tip' ? null : draft.rating,
    parentPostId: draft.kind === 'remix' ? draft.parentPostId : null,
    media: [...media],
  };
}

/** Size that fits inside `maxEdge` on its longest side without upscaling. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = COMPOSE_LIMITS.photoEdge,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Overall upload progress (0..1) from per-photo fractions. */
export function overallProgress(fractions: readonly number[]): number {
  if (fractions.length === 0) return 0;
  const total = fractions.reduce((sum, value) => sum + Math.min(1, Math.max(0, value)), 0);
  return total / fractions.length;
}
