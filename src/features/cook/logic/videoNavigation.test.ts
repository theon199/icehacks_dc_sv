import { decideVideoLoad } from './videoNavigation';
import { VIDEO_PAGE_URL } from './videoPage';

const embed = 'https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1';

describe('decideVideoLoad', () => {
  it('plays the embed page and blank frames in place', () => {
    expect(decideVideoLoad({ url: embed, isTopFrame: true, navigationType: 'other' })).toBe(
      'allow',
    );
    expect(decideVideoLoad({ url: 'about:blank' })).toBe('allow');
  });

  it('lets the local page through only as its first top-level load', () => {
    expect(
      decideVideoLoad({ url: VIDEO_PAGE_URL, isTopFrame: true, navigationType: 'other' }),
    ).toBe('allow');
    // Android reports neither field.
    expect(decideVideoLoad({ url: VIDEO_PAGE_URL })).toBe('allow');
  });

  it('never fetches the local page base url over the network', () => {
    // A reload or history step of an HTML-string page re-requests its base URL.
    for (const navigationType of ['reload', 'backforward', 'formresubmit', 'formsubmit']) {
      expect(decideVideoLoad({ url: VIDEO_PAGE_URL, isTopFrame: true, navigationType })).toBe(
        'block',
      );
    }
    // A tap on a link to it is not sent to the browser either.
    expect(
      decideVideoLoad({ url: VIDEO_PAGE_URL, isTopFrame: true, navigationType: 'click' }),
    ).toBe('block');
    // Nor is it loaded inside a frame, where every other https page would be allowed.
    for (const navigationType of ['other', 'click']) {
      expect(decideVideoLoad({ url: VIDEO_PAGE_URL, isTopFrame: false, navigationType })).toBe(
        'block',
      );
    }
  });

  it('lets frames inside the player load without leaving cook mode', () => {
    expect(
      decideVideoLoad({
        url: 'https://consent.example.org/prompt',
        isTopFrame: false,
        navigationType: 'other',
      }),
    ).toBe('allow');
    // Even a tap inside a sub-frame never opens the browser.
    expect(
      decideVideoLoad({
        url: 'https://ads.example.org/x',
        isTopFrame: false,
        navigationType: 'click',
      }),
    ).toBe('allow');
  });

  it('keeps locally built and plain-http sub-frames inside the player', () => {
    for (const url of [
      'about:srcdoc',
      'blob:https://www.youtube-nocookie.com/0b7c6f1e-2d4a-4c55-9a51-3f6f1a2b9c10',
      'data:text/html,<p>frame</p>',
      'http://ads.example.org/pixel',
    ]) {
      expect(decideVideoLoad({ url, isTopFrame: false, navigationType: 'other' })).toBe('allow');
    }
  });

  it('never lets a sub-frame hand off to another app', () => {
    for (const url of ['itms-apps://apps.apple.com/app/id1', 'intent://open#Intent;end']) {
      expect(decideVideoLoad({ url, isTopFrame: false, navigationType: 'click' })).toBe('block');
    }
  });

  it('does not treat the embed host over plain http as the embed', () => {
    expect(
      decideVideoLoad({
        url: 'http://www.youtube-nocookie.com/embed/abcdefghijk',
        isTopFrame: true,
        navigationType: 'other',
      }),
    ).toBe('block');
  });

  it('opens a link the cook tapped in the main frame externally', () => {
    expect(
      decideVideoLoad({
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        isTopFrame: true,
        navigationType: 'click',
      }),
    ).toBe('external');
  });

  it('blocks main-frame loads nobody tapped, such as scripted redirects', () => {
    expect(
      decideVideoLoad({
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        isTopFrame: true,
        navigationType: 'other',
      }),
    ).toBe('block');
    // Android reports no frame and always `other`.
    expect(decideVideoLoad({ url: 'https://example.org/', navigationType: 'other' })).toBe('block');
  });

  it('blocks malformed urls and non-web schemes', () => {
    expect(decideVideoLoad({ url: 'not a url', isTopFrame: true, navigationType: 'click' })).toBe(
      'block',
    );
    expect(
      decideVideoLoad({
        url: 'intent://open#Intent;end',
        isTopFrame: true,
        navigationType: 'click',
      }),
    ).toBe('block');
  });
});
