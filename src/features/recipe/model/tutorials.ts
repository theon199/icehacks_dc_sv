/**
 * Tutorial links. YouTube videos play inline through the privacy-enhanced (no-cookie) embed; every
 * other link opens in the in-app browser.
 */
import type { RecipeTutorial } from '@/lib/catalog';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character video id from any common YouTube URL shape, or null. */
export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = parsed.pathname.split('/')[1] ?? null;
  } else if (
    host === 'youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'music.youtube.com'
  ) {
    if (parsed.pathname === '/watch') candidate = parsed.searchParams.get('v');
    else {
      const [, kind, id] = parsed.pathname.split('/');
      if (kind === 'embed' || kind === 'shorts' || kind === 'live' || kind === 'v') {
        candidate = id ?? null;
      }
    }
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/**
 * The origin the player page is served from. YouTube refuses to play embeds that arrive without a
 * referrer identifying the embedding client, so the player is a small local page loaded with this
 * base URL (the app's bundle id as an https origin) and the embed is an iframe inside it.
 */
export const PLAYER_ORIGIN = 'https://com.famara.app';
export const PLAYER_BASE_URL = `${PLAYER_ORIGIN}/`;
const EMBED_PREFIX = 'https://www.youtube-nocookie.com/embed/';

export function youtubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    origin: PLAYER_ORIGIN,
  });
  return `${EMBED_PREFIX}${encodeURIComponent(videoId)}?${params}`;
}

export type PlayerLoad = 'allow' | 'open-outside' | 'block';

/**
 * What the player does with a load. Loads inside the embed (the iframe and whatever it frames)
 * stay. A top-level load is either the player page itself or a click out of the player (the
 * YouTube logo, "watch on YouTube"), which opens in the in-app browser instead. `isTopFrame` is
 * undefined where the platform does not report it; the embed itself is still allowed then.
 */
export function playerLoad(url: string, isTopFrame: boolean | undefined): PlayerLoad {
  if (isTopFrame === false) return 'allow';
  if (url === PLAYER_BASE_URL || url === 'about:blank') return 'allow';
  if (isTopFrame === undefined && url.startsWith(EMBED_PREFIX)) return 'allow';
  return /^https?:\/\//i.test(url) ? 'open-outside' : 'block';
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);

/** A full-bleed page holding the embed, meant to load with `PLAYER_BASE_URL` as its base. */
export function youtubePlayerHtml(videoId: string, title: string): string {
  const src = escapeHtml(youtubeEmbedUrl(videoId));
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">',
    '<meta name="referrer" content="strict-origin-when-cross-origin">',
    '<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>',
    '</head><body>',
    `<iframe src="${src}" title="${escapeHtml(title)}" referrerpolicy="strict-origin-when-cross-origin"`,
    ' allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>',
    '</body></html>',
  ].join('');
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export type TutorialItem =
  | {
      readonly kind: 'youtube';
      readonly key: string;
      readonly videoId: string;
      readonly title: string;
      readonly url: string;
    }
  | {
      readonly kind: 'link';
      readonly key: string;
      readonly url: string;
      readonly title: string;
      readonly publisher: string | null;
      readonly video: boolean;
    };

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Only http(s) links are ever opened. */
export function isSafeLink(url: string): boolean {
  return /^https?:\/\//i.test(url) && hostOf(url) !== null;
}

/** Tutorials ready to render, videos first, duplicates and unsafe links removed. */
export function tutorialItems(tutorials: readonly RecipeTutorial[]): TutorialItem[] {
  const seen = new Set<string>();
  const out: TutorialItem[] = [];
  for (const t of tutorials) {
    if (!isSafeLink(t.url)) continue;
    const videoId = t.kind === 'video' ? youtubeVideoId(t.url) : null;
    const key = videoId ? `yt:${videoId}` : t.url;
    if (seen.has(key)) continue;
    seen.add(key);
    if (videoId) {
      out.push({
        kind: 'youtube',
        key,
        videoId,
        title: t.title ?? 'Video walkthrough',
        url: t.url,
      });
    } else {
      out.push({
        kind: 'link',
        key,
        url: t.url,
        title: t.title ?? (t.kind === 'video' ? 'Watch the video' : 'Read the full method'),
        publisher: t.publisher ?? hostOf(t.url),
        video: t.kind === 'video',
      });
    }
  }
  return out.sort((a, b) => (a.kind === 'youtube' ? 0 : 1) - (b.kind === 'youtube' ? 0 : 1));
}
