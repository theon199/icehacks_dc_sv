/**
 * The small local page the cook-mode player loads. YouTube refuses to play an embed that arrives
 * with no referrer (its player shows error 153), and a WebView pointed straight at the embed URL
 * sends none. Loading this page with `VIDEO_PAGE_URL` as its base gives the document an https
 * origin of the app's own, so the embed frame inside it is requested with that origin as referrer.
 */
import { youtubeEmbedUrl } from './session';

/** The app's bundle id as an https origin. Nothing is ever fetched from it. */
export const VIDEO_PAGE_ORIGIN = 'https://com.famara.app';
/** Base URL the page is loaded with; the navigation gate lets exactly this top-level load through. */
export const VIDEO_PAGE_URL = `${VIDEO_PAGE_ORIGIN}/`;

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};

function attribute(value: string): string {
  return value.replace(/["'&<>]/g, (char) => ENTITIES[char] ?? char);
}

/** The embed address for the page: inline playback, and the page's origin for the player API. */
export function videoPageEmbedUrl(videoId: string): string {
  const url = new URL(youtubeEmbedUrl(encodeURIComponent(videoId)));
  url.searchParams.set('origin', VIDEO_PAGE_ORIGIN);
  return url.toString();
}

/** HTML for a page that is nothing but the embed, filling the frame edge to edge. */
export function videoPageHtml(videoId: string, title: string): string {
  const css =
    'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:black}' +
    'iframe{display:block;width:100%;height:100%;border:0}';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta name="referrer" content="origin">
<style>${css}</style>
</head>
<body>
<iframe src="${attribute(videoPageEmbedUrl(videoId))}" title="${attribute(title)}" referrerpolicy="origin" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
</body>
</html>`;
}
