import type { CommentRow, MediaItem, PostCardRow } from './schemas';

/** One photo of a post, with a signed URL when the server granted one. */
export interface PostPhoto extends MediaItem {
  url: string | null;
}

/** A post ready for display: the `post_cards` row plus resolved photo and avatar URLs. */
export interface Post extends Omit<PostCardRow, 'media'> {
  media: PostPhoto[];
  authorAvatarUrl: string | null;
}

/** A page of the feed as the UI keeps it in the query cache. */
export interface FeedPage {
  items: Post[];
  nextCursor: string | null;
}

/** A comment ready for display. */
export interface Comment extends CommentRow {
  authorAvatarUrl: string | null;
}

/** Where the next page of comments starts: just after this comment. */
export interface CommentCursor {
  createdAt: string;
  id: string;
}

/** A page of comments as the UI keeps it in the query cache. */
export interface CommentPage {
  items: Comment[];
  nextCursor: CommentCursor | null;
}

/** A top-level comment with its replies (one level, oldest first). */
export interface CommentThread {
  comment: Comment;
  replies: Comment[];
}
