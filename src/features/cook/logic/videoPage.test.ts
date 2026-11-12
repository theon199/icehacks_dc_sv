import { decideVideoLoad } from './videoNavigation';
import { VIDEO_PAGE_ORIGIN, VIDEO_PAGE_URL, videoPageEmbedUrl, videoPageHtml } from './videoPage';

describe('videoPageEmbedUrl', () => {
  it('uses the privacy-enhanced embed, plays inline and names the page origin', () => {
    const url = new URL(videoPageEmbedUrl('abcdefghijk'));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/abcdefghijk');
    expect(url.searchParams.get('playsinline')).toBe('1');
    expect(url.searchParams.get('origin')).toBe(VIDEO_PAGE_ORIGIN);
  });

  it('keeps an odd id inside the path', () => {
    const url = new URL(videoPageEmbedUrl('a/b?c#d'));
    expect(url.pathname).toBe('/embed/a%2Fb%3Fc%23d');
    expect(url.hash).toBe('');
  });
});

describe('videoPageHtml', () => {
  it('asks for the page origin to be sent as the referrer', () => {
    const html = videoPageHtml('abcdefghijk', 'Lentil soup');
    expect(html).toContain('<meta name="referrer" content="origin">');
    expect(html).toContain('referrerpolicy="origin"');
  });

  it('escapes the title so it cannot break out of the attribute', () => {
    const html = videoPageHtml('abcdefghijk', '"><script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  });

  it('escapes the embed address inside the src attribute', () => {
    expect(videoPageHtml('abcdefghijk', 'Soup')).toMatch(/src="[^"<>]*&amp;[^"<>]*"/);
  });
});

describe('the page under the navigation gate', () => {
  it('loads the page itself in place', () => {
    expect(
      decideVideoLoad({ url: VIDEO_PAGE_URL, isTopFrame: true, navigationType: 'other' }),
    ).toBe('allow');
    // Android reports no frame.
    expect(decideVideoLoad({ url: VIDEO_PAGE_URL, navigationType: 'other' })).toBe('allow');
  });

  it('does not let other addresses on the page origin take over the player', () => {
    expect(
      decideVideoLoad({
        url: `${VIDEO_PAGE_ORIGIN}/elsewhere`,
        isTopFrame: true,
        navigationType: 'other',
      }),
    ).toBe('block');
  });
});
