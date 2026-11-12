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
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
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

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1`;
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
      out.push({ kind: 'youtube', key, videoId, title: t.title ?? 'Video walkthrough', url: t.url });
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
