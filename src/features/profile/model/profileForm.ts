/**
 * Validation for the edit-profile form. The rules mirror the `profiles` table constraints so most
 * mistakes are caught before a round trip; the server stays the final judge (handle uniqueness and
 * reserved names are only known there).
 */
import type { ApiError } from '@/lib/api/errors';

import { CUISINE_ID_PATTERN, MAX_PROFILE_CUISINES } from './cuisines';

export const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,24}$/;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 280;

export interface ProfileDraft {
  displayName: string;
  handle: string;
  bio: string;
  cuisines: readonly string[];
}

export type ProfileField = keyof ProfileDraft;
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

export type ProfileValidation =
  | { ok: true; value: ProfileDraft }
  | { ok: false; errors: ProfileFieldErrors };

/** Characters as Postgres counts them (code points), not UTF-16 units. */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// Control characters (C0 and DEL/C1), which the server refuses in display names.
// eslint-disable-next-line no-control-regex -- matching control characters is the point here
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Trims and normalises a draft the way it will be stored. */
export function normalizeDraft(draft: ProfileDraft): ProfileDraft {
  return {
    displayName: draft.displayName.trim(),
    handle: draft.handle.trim().replace(/^@+/, ''),
    bio: draft.bio.replace(/\r\n?/g, '\n').trim(),
    cuisines: draft.cuisines.map((id) => id.trim()),
  };
}

export function validateProfileDraft(draft: ProfileDraft): ProfileValidation {
  const value = normalizeDraft(draft);
  const errors: ProfileFieldErrors = {};

  if (value.displayName.length === 0) {
    errors.displayName = 'Add the name you want people to see.';
  } else if (charCount(value.displayName) > DISPLAY_NAME_MAX) {
    errors.displayName = `Keep your name to ${DISPLAY_NAME_MAX} characters or fewer.`;
  } else if (CONTROL_CHARS.test(value.displayName)) {
    errors.displayName = 'Your name can only use regular characters.';
  }

  if (value.handle.length < 3 || value.handle.length > 24) {
    errors.handle = 'Handles are 3 to 24 characters long.';
  } else if (!HANDLE_PATTERN.test(value.handle)) {
    errors.handle = 'Use letters, numbers and underscores only.';
  }

  if (charCount(value.bio) > BIO_MAX) {
    errors.bio = `Keep your bio to ${BIO_MAX} characters or fewer.`;
  }

  if (value.cuisines.length > MAX_PROFILE_CUISINES) {
    errors.cuisines = `Pick up to ${MAX_PROFILE_CUISINES} cuisines.`;
  } else if (
    value.cuisines.some((id) => !CUISINE_ID_PATTERN.test(id)) ||
    new Set(value.cuisines).size !== value.cuisines.length
  ) {
    errors.cuisines = 'One of those cuisines is not recognised. Please pick again.';
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** Columns a member may update on their own profile row. */
export interface ProfilePatch {
  display_name?: string;
  handle?: string;
  bio?: string;
  cuisines?: string[];
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * The columns that differ between the saved profile and a validated draft. Handles compare
 * case-insensitively, as the database does, but a change of case alone is still sent so people can
 * restyle their handle.
 */
export function profilePatch(saved: ProfileDraft, next: ProfileDraft): ProfilePatch {
  const patch: ProfilePatch = {};
  if (saved.displayName !== next.displayName) patch.display_name = next.displayName;
  if (saved.handle !== next.handle) patch.handle = next.handle;
  if (saved.bio !== next.bio) patch.bio = next.bio;
  if (!sameList(saved.cuisines, next.cuisines)) patch.cuisines = [...next.cuisines];
  return patch;
}

export function isEmptyPatch(patch: ProfilePatch): boolean {
  return Object.keys(patch).length === 0;
}

export interface SaveErrorView {
  fields: ProfileFieldErrors;
  /** Message for the whole form when the problem is not tied to one field. */
  form: string | null;
}

/** Turns a failed save into field-level messages where the cause is known. */
export function saveErrorView(error: ApiError): SaveErrorView {
  switch (error.code) {
    case 'unique_violation':
      return { fields: { handle: 'That handle is taken. Try another one.' }, form: null };
    case 'handle_reserved':
      return { fields: { handle: 'That handle is reserved. Try another one.' }, form: null };
    case 'check_violation':
      return {
        fields: {},
        form: 'Some details did not fit the rules for profiles. Please check them and try again.',
      };
    default:
      return { fields: {}, form: error.userMessage };
  }
}
