import {
  PLAYER_BASE_URL,
  playerLoad,
  tutorialItems,
  youtubeEmbedUrl,
  youtubePlayerHtml,
  youtubeVideoId,
} from './tutorials';

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

describe('youtubePlayerHtml', () => {
  it('frames the embed with a referrer policy and names the app as the origin', () => {
    const html = youtubePlayerHtml('uO0ejc85zSE', 'Knife <skills> & "tips"');
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('origin=https%3A%2F%2Fcom.famara.app');
    expect(html).toContain('title="Knife &lt;skills&gt; &amp; &quot;tips&quot;"');
    expect(html).not.toContain('<skills>');
  });
});

describe('playerLoad', () => {
  it('lets the embed load anything inside its own frames', () => {
    expect(playerLoad('https://googleads.example/frame', false)).toBe('allow');
  });

  it('allows the player page itself', () => {
    expect(playerLoad(PLAYER_BASE_URL, true)).toBe('allow');
    expect(playerLoad('about:blank', true)).toBe('allow');
  });

  it('opens top-level clicks out of the player in the browser', () => {
    expect(playerLoad('https://www.youtube.com/watch?v=uO0ejc85zSE', true)).toBe('open-outside');
    expect(playerLoad('intent://something', true)).toBe('block');
  });

  it('still allows the embed where the platform does not report the frame', () => {
    expect(playerLoad(youtubeEmbedUrl('uO0ejc85zSE'), undefined)).toBe('allow');
    expect(playerLoad('https://www.youtube.com/', undefined)).toBe('open-outside');
  });
});
