import { mergeFeedPages, removeFeedPosts, updateFeedPost, type FeedData } from './feedCache';
import { makePage, makePost } from '../testing/fixtures';

function feed(...pages: ReturnType<typeof makePage>[]): FeedData {
  return { pages, pageParams: pages.map((_, index) => (index === 0 ? null : `c${index}`)) };
}

describe('mergeFeedPages', () => {
  it('returns an empty list before the first page loads', () => {
    expect(mergeFeedPages(undefined)).toEqual([]);
  });

  it('keeps page order and post order', () => {
    const a = makePost();
    const b = makePost();
    const c = makePost();
    expect(mergeFeedPages([makePage([a, b], 'x'), makePage([c])]).map((p) => p.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
  });

  it('drops a post that moved onto a later page, keeping its first position', () => {
    const a = makePost();
    const b = makePost();
    const c = makePost();
    const movedA = { ...a, like_count: a.like_count + 5 };
    const merged = mergeFeedPages([makePage([a, b], '2'), makePage([movedA, c])]);
    expect(merged.map((p) => p.id)).toEqual([a.id, b.id, c.id]);
    expect(merged[0]).toBe(a);
  });
});

describe('updateFeedPost', () => {
  it('updates the post on every page that holds it', () => {
    const a = makePost();
    const data = feed(makePage([a]), makePage([a, makePost()]));
    const next = updateFeedPost(data, a.id, (post) => ({ ...post, like_count: 99 }));
    expect(next?.pages[0]?.items[0]?.like_count).toBe(99);
    expect(next?.pages[1]?.items[0]?.like_count).toBe(99);
  });

  it('returns the same object when the post is not cached', () => {
    const data = feed(makePage([makePost()]));
    expect(updateFeedPost(data, 'missing', (post) => ({ ...post, like_count: 1 }))).toBe(data);
  });

  it('leaves untouched pages as the same objects', () => {
    const a = makePost();
    const other = makePage([makePost()]);
    const data = feed(makePage([a]), other);
    const next = updateFeedPost(data, a.id, (post) => ({ ...post, title: 'New' }));
    expect(next?.pages[1]).toBe(other);
  });
});

describe('removeFeedPosts', () => {
  it('removes every post by a blocked author and keeps the cursors', () => {
    const blocked = makePost({ author_id: 'blocked' });
    const kept = makePost({ author_id: 'friend' });
    const data = feed(makePage([blocked, kept], 'next'));
    const next = removeFeedPosts(data, (post) => post.author_id === 'blocked');
    expect(next?.pages[0]?.items).toEqual([kept]);
    expect(next?.pages[0]?.nextCursor).toBe('next');
    expect(next?.pageParams).toEqual(data.pageParams);
  });

  it('handles an empty cache', () => {
    expect(removeFeedPosts(undefined, () => true)).toBeUndefined();
  });
});
