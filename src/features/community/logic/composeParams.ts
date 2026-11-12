/**
 * What the compose sheet can be opened with. Cook mode's completion screen hands over the rating,
 * the "what I changed" note and the photo it took; these arrive as route params (which anyone can
 * put in a deep link), so every value is checked before it reaches the draft.
 */
import { intParam, stringParam, type RawParam } from '@/lib/params';

import { COMPOSE_LIMITS, type DraftPhoto } from './compose';

/** What the person just cooked, to start a "cook" post from. */
export interface CookShareSeed {
  rating: number | null;
  /** Offered as the post body; empty when there was no note. */
  note: string;
  photo: DraftPhoto | null;
}

export interface ComposeRouteParams {
  recipe?: RawParam;
  remix?: RawParam;
  from?: RawParam;
  rating?: RawParam;
  note?: RawParam;
  photo?: RawParam;
  photoWidth?: RawParam;
  photoHeight?: RawParam;
}

/** Largest photo edge accepted from a link; anything bigger did not come from cook mode. */
const MAX_PHOTO_EDGE = 20_000;

/** Only files on this device can be uploaded; remote or inline images are ignored. */
function isLocalFile(uri: string): boolean {
  return uri.startsWith('file://');
}

function photoFrom(params: ComposeRouteParams): DraftPhoto | null {
  const uri = stringParam(params.photo);
  const width = intParam(params.photoWidth, 1, MAX_PHOTO_EDGE);
  const height = intParam(params.photoHeight, 1, MAX_PHOTO_EDGE);
  if (!uri || !isLocalFile(uri) || width === undefined || height === undefined) return null;
  return { uri, width, height };
}

/** The cook-mode handover, or null when the sheet was not opened from cook mode. */
export function parseCookShare(params: ComposeRouteParams): CookShareSeed | null {
  if (stringParam(params.from) !== 'cook') return null;
  return {
    rating: intParam(params.rating, 1, 5) ?? null,
    note: (stringParam(params.note) ?? '').slice(0, COMPOSE_LIMITS.body),
    photo: photoFrom(params),
  };
}
