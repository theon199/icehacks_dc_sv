import { countVisible, mergeCommentPages, threadComments, validateComment } from './comments';
import { makeComment } from '../testing/fixtures';

describe('threadComments', () => {
  it('nests replies under their parent in server order', () => {
    const first = makeComment();
    const second = makeComment();
    const reply = makeComment({ parent_comment_id: first.id });
    const threads = threadComments([first, second, reply]);
    expect(threads.map((t) => t.comment.id)).toEqual([first.id, second.id]);
    expect(threads[0]?.replies).toEqual([reply]);
    expect(threads[1]?.replies).toEqual([]);
  });

  it('shows a reply whose parent is missing as a top-level comment', () => {
    const orphan = makeComment({ parent_comment_id: 'gone' });
    expect(threadComments([orphan])).toEqual([{ comment: orphan, replies: [] }]);
  });

  it('keeps a deleted comment only while it has replies', () => {
    const deleted = makeComment({ body: '', deleted_at: '2026-11-10T20:00:00Z' });
    const reply = makeComment({ parent_comment_id: deleted.id });
    const lonely = makeComment({ body: '', deleted_at: '2026-11-10T20:00:00Z' });
    const threads = threadComments([deleted, lonely, reply]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.comment.id).toBe(deleted.id);
  });

  it('counts only comments that were not deleted', () => {
    expect(countVisible([makeComment(), makeComment({ deleted_at: 'x', body: '' })])).toBe(1);
  });
});

describe('validateComment', () => {
  it('trims and accepts normal text', () => {
    expect(validateComment('  nice  ')).toEqual({ ok: true, body: 'nice' });
  });

  it('rejects empty and overlong text', () => {
    expect(validateComment('   ').ok).toBe(false);
    expect(validateComment('a'.repeat(1001)).ok).toBe(false);
  });
});

describe('mergeCommentPages', () => {
  it('joins pages in order and skips a comment seen on an earlier page', () => {
    const a = makeComment();
    const b = makeComment();
    const c = makeComment();
    const pages = [
      { items: [a, b], nextCursor: { createdAt: b.created_at, id: b.id } },
      { items: [b, c], nextCursor: null },
    ];
    expect(mergeCommentPages(pages).map((comment) => comment.id)).toEqual([a.id, b.id, c.id]);
  });

  it('is empty before anything has loaded', () => {
    expect(mergeCommentPages(undefined)).toEqual([]);
  });
});
