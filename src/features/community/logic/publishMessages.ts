/** Copy for publish outcomes, kept in one place so compose and comments say the same thing. */
import { isApiError, type ApiError } from '@/lib/api/errors';

export const HELD_POST_MESSAGE =
  "Thanks for sharing. Your post is waiting for a quick review before others can see it. We'll let you know in your notifications once it's decided.";

export const HELD_COMMENT_MESSAGE =
  'Your comment is waiting for a quick review before others can see it.';

const RATE_LIMITED =
  "You've posted a lot in a short time. Take a breather and try again a bit later.";

const CONFLICT =
  "Something changed while you were posting, so it didn't go through. Tap Post to try again; your photos will be sent again too.";

const GENERIC = 'Something went wrong. Please try again.';

/**
 * Copy for specific machine reasons. These arrive as `ApiError.code` from the direct RPC calls
 * (comments, likes, the publish fallback). The publish function reports its own HTTP code there
 * instead (`conflict`, `invalid_request`, …), so for it the status and server sentence below
 * decide the copy.
 */
const REASON_COPY: Record<string, string> = {
  rate_limited: RATE_LIMITED,
  suspended: 'Your account is paused from posting for now. Check your notifications for details.',
  underage: 'Community posting is available from age 13.',
  age_restricted: 'Community posting is available from age 13.',
  age_gate_required: 'Confirm your birth year in Settings before posting.',
  media_unavailable: 'One of your photos needs to be uploaded again. Tap Post to retry.',
  media_not_uploaded: 'One of your photos did not finish uploading. Tap Post to retry.',
  parent_not_found: 'The post you were remixing is no longer available.',
  post_not_found: 'This post is no longer available.',
  recipe_required: 'Pick the recipe this post is about.',
  reply_depth_exceeded: 'You can only reply to top-level comments.',
};

function messageFor(error: ApiError): string {
  if (error.kind === 'rate_limited') return RATE_LIMITED;
  const known = error.code ? REASON_COPY[error.code] : undefined;
  if (known) return known;
  // The server's sentence explains a rejected request best; the generic copy is the fallback.
  if (error.status === 409) return error.serverMessage ?? CONFLICT;
  return error.userMessage;
}

/** Friendly copy for a failed publish, comment or engagement call. */
export function publishErrorMessage(error: unknown): string {
  return isApiError(error) ? messageFor(error) : GENERIC;
}
