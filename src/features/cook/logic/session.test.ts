import {
  clampStep,
  fitWithin,
  localDateString,
  pickTutorialVideo,
  stepProgress,
  youtubeEmbedUrl,
  youtubeVideoId,
} from './session';

describe('step navigation', () => {
  it('keeps the step inside the recipe', () => {
    expect(clampStep(-1, 5)).toBe(0);
    expect(clampStep(9, 5)).toBe(4);
    expect(clampStep(2.7, 5)).toBe(2);
    expect(clampStep(3, 0)).toBe(0);
    expect(clampStep(Number.NaN, 4)).toBe(0);
  });

  it('reports progress including the step on screen', () => {
    expect(stepProgress(0, 4)).toBe(0.25);
    expect(stepProgress(3, 4)).toBe(1);
    expect(stepProgress(0, 0)).toBe(0);
  });
});

describe('tutorial video', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/12345', null],
    ['https://www.youtube.com/watch?v=short', null],
    ['https://evil.example/watch?v=dQw4w9WgXcQ', null],
    ['javascript:alert(1)', null],
    ['not a url', null],
  ])('reads the id of %s', (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it('prefers a video that can play inside cook mode', () => {
    const video = pickTutorialVideo([
      { kind: 'web', url: 'https://example.org/recipe', title: null, publisher: null },
      { kind: 'video', url: 'https://vimeo.com/1', title: 'Other', publisher: null },
      {
        kind: 'video',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        title: 'How to',
        publisher: 'A cook',
      },
    ]);
    expect(video).toEqual({
      youtubeId: 'dQw4w9WgXcQ',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'How to',
      publisher: 'A cook',
    });
  });

  it('falls back to a link-only video and to nothing', () => {
    expect(
      pickTutorialVideo([
        { kind: 'video', url: 'https://vimeo.com/1', title: null, publisher: null },
      ])?.youtubeId,
    ).toBeNull();
    expect(pickTutorialVideo([])).toBeNull();
  });

  it('embeds without tracking cookies and plays inline', () => {
    const url = youtubeEmbedUrl('dQw4w9WgXcQ');
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?')).toBe(true);
    expect(url).toContain('playsinline=1');
  });
});

describe('localDateString', () => {
  it('uses the device calendar day', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDateString(new Date(2026, 10, 30, 0, 1))).toBe('2026-11-30');
  });
});

describe('fitWithin', () => {
  it('shrinks the longest edge to the limit', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('leaves small or unknown sizes alone', () => {
    expect(fitWithin(1200, 900, 1600)).toBeNull();
    expect(fitWithin(0, 900, 1600)).toBeNull();
  });
});
