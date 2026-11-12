import { decideVideoLoad } from './videoNavigation';

const embed = 'https://www.youtube-nocookie.com/embed/abcdefghijk?playsinline=1';

describe('decideVideoLoad', () => {
  it('plays the embed page and blank frames in place', () => {
    expect(decideVideoLoad({ url: embed, isTopFrame: true, navigationType: 'other' })).toBe(
      'allow',
    );
    expect(decideVideoLoad({ url: 'about:blank' })).toBe('allow');
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
