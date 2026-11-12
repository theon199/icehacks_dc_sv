/** Copy for publish outcomes, kept in one place so compose and comments say the same thing. */
import { isApiError } from '@/lib/api/errors';

export const HELD_POST_MESSAGE =
  "Thanks for sharing. Your post is waiting for a quick review before others can see it. We'll let you know in your notifications once it's decided.";

export const HELD_COMMENT_MESSAGE =
  'Your comment is waiting for a quick review before others can see it.';

const CODE_COPY: Record<string, string> = {
  rate_limited: "You've posted a lot in a short time. Take a breather and try again a bit later.",
  suspended: 'Your account is paused from posting for now. Check your notifications for details.',
  underage: 'Community posting is available from age 13.',
  age_gate_required: 'Confirm your birth year in Settings before posting.',
  media_unavailable: 'One of your photos needs to be uploaded again. Tap Post to retry.',
  media_not_uploaded: 'One of your photos did not finish uploading. Tap Post to retry.',
  parent_not_found: 'The post you were remixing is no longer available.',
  post_not_found: 'This post is no longer available.',
  recipe_required: 'Pick the recipe this post is about.',
  reply_depth_exceeded: 'You can only reply to top-level comments.',
};

/** Friendly copy for a failed publish, comment or engagement call. */
export function publishErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const known = error.code ? CODE_COPY[error.code] : undefined;
    if (known) return known;
    return error.userMessage;
  }
  return 'Something went wrong. Please try again.';
}
