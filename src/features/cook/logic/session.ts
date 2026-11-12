/**
 * Small pure helpers for the cook-mode screens: step navigation, tutorial video choice, the cook's
 * calendar day and photo sizing.
 */
import type { RecipeTutorial } from '@/lib/catalog';

export function clampStep(index: number, stepCount: number): number {
  if (stepCount <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), stepCount - 1);
}

/** Share of the recipe done once the given step is on screen, in [0, 1]. */
export function stepProgress(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return (clampStep(index, stepCount) + 1) / stepCount;
}

export function stepTimerLabel(stepIndex: number): string {
  return `Step ${stepIndex + 1}`;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** The video id of a YouTube link (watch, short link, embed or shorts), or null. */
export function youtubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);
  let candidate: string | null | undefined = null;
  if (host === 'youtu.be') candidate = segments[0];
  else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === 'watch') candidate = parsed.searchParams.get('v');
    else if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') {
      candidate = segments[1];
    }
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

export interface TutorialVideo {
  /** Embeddable YouTube id, when the video can play inside cook mode. */
  youtubeId: string | null;
  url: string;
  title: string | null;
  publisher: string | null;
}

/** The tutorial video to offer in cook mode: an embeddable one first, else any video link. */
export function pickTutorialVideo(tutorials: readonly RecipeTutorial[]): TutorialVideo | null {
  const videos = tutorials.filter((tutorial) => tutorial.kind === 'video');
  const withIds = videos.map((video) => ({ video, id: youtubeVideoId(video.url) }));
  const chosen = withIds.find((entry) => entry.id !== null) ?? withIds[0];
  if (!chosen) return null;
  return {
    youtubeId: chosen.id,
    url: chosen.video.url,
    title: chosen.video.title,
    publisher: chosen.video.publisher,
  };
}

/** Privacy-enhanced embed URL that plays inline. */
export function youtubeEmbedUrl(id: string): string {
  const params = new URLSearchParams({ playsinline: '1', rel: '0', modestbranding: '1' });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The device's calendar day for `date` as `YYYY-MM-DD` (streaks count local days). */
export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Size that fits a photo inside `maxEdge` on its longest side, keeping the aspect ratio. Null when
 * the photo already fits and needs no resizing.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0) || !(maxEdge > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
