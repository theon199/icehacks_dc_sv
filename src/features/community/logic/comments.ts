/** Builds the one-level comment thread shown under a post. */
import type { Comment, CommentThread } from '../api/types';

/**
 * Groups replies under their parent, keeping server order (oldest first). A reply whose parent is
 * not in the list (removed, or by someone the viewer cannot see) is shown as a top-level comment so
 * it is never silently lost. A deleted comment is only kept as a placeholder while it has replies.
 */
export function threadComments(comments: readonly Comment[]): CommentThread[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const threads = new Map<string, CommentThread>();
  const order: string[] = [];

  const threadFor = (comment: Comment): CommentThread => {
    let thread = threads.get(comment.id);
    if (!thread) {
      thread = { comment, replies: [] };
      threads.set(comment.id, thread);
      order.push(comment.id);
    }
    return thread;
  };

  for (const comment of comments) {
    const parent = comment.parent_comment_id ? byId.get(comment.parent_comment_id) : undefined;
    if (parent) threadFor(parent).replies.push(comment);
    else threadFor(comment);
  }

  return order
    .map((id) => threads.get(id))
    .filter((thread): thread is CommentThread => thread !== undefined)
    .filter((thread) => !isDeleted(thread.comment) || thread.replies.length > 0);
}

export function isDeleted(comment: Comment): boolean {
  return comment.deleted_at != null;
}

/** Comments that count towards the post's total (not blanked placeholders). */
export function countVisible(comments: readonly Comment[]): number {
  return comments.filter((comment) => !isDeleted(comment)).length;
}

export const COMMENT_MAX_LENGTH = 1000;

/** Trimmed comment text, or an error message when it cannot be sent. */
export function validateComment(
  text: string,
): { ok: true; body: string } | { ok: false; error: string } {
  const body = text.trim();
  if (body.length === 0) return { ok: false, error: 'Write something first.' };
  if (body.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Comments can be up to ${COMMENT_MAX_LENGTH} characters.` };
  }
  return { ok: true, body };
}
