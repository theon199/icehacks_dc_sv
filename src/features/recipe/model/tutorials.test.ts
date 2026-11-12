import { tutorialItems, youtubeEmbedUrl, youtubeVideoId } from './tutorials';

describe('youtubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=uO0ejc85zSE', 'uO0ejc85zSE'],
    ['https://youtu.be/uO0ejc85zSE?t=10', 'uO0ejc85zSE'],
    ['https://m.youtube.com/watch?v=uO0ejc85zSE&feature=share', 'uO0ejc85zSE'],
    ['https://www.youtube.com/shorts/uO0ejc85zSE', 'uO0ejc85zSE'],
    ['https://www.youtube-nocookie.com/embed/uO0ejc85zSE', 'uO0ejc85zSE'],
  ])('reads %s', (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it.each(['https://vimeo.com/123', 'https://www.youtube.com/watch?v=short', 'not a url'])(
    'rejects %s',
    (url) => {
      expect(youtubeVideoId(url)).toBeNull();
    },
  );

  it('embeds through the no-cookie domain', () => {
    expect(youtubeEmbedUrl('uO0ejc85zSE')).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/uO0ejc85zSE\?/,
    );
  });
});

describe('tutorialItems', () => {
  it('puts videos first, removes duplicates and unsafe links', () => {
    const items = tutorialItems([
      { kind: 'web', url: 'https://example.org/recipe', title: null, publisher: null },
      { kind: 'video', url: 'https://youtu.be/uO0ejc85zSE', title: 'How to', publisher: null },
      {
        kind: 'video',
        url: 'https://www.youtube.com/watch?v=uO0ejc85zSE',
        title: 'Same video',
        publisher: null,
      },
      { kind: 'web', url: 'javascript:alert(1)', title: 'Bad', publisher: null },
    ]);
    expect(items).toEqual([
      expect.objectContaining({ kind: 'youtube', videoId: 'uO0ejc85zSE', title: 'How to' }),
      expect.objectContaining({
        kind: 'link',
        title: 'Read the full method',
        publisher: 'example.org',
      }),
    ]);
  });
});
