/**
 * What the inline tutorial player does with each page load it is asked about. The local player page
 * and the embed inside it play in place; a link the cook deliberately taps goes to the system
 * browser; nothing else is allowed to pull them out of cook mode.
 */
import { VIDEO_PAGE_URL } from './videoPage';

export type VideoLoadDecision = 'allow' | 'external' | 'block';

/** The fields of a WebView load request this decision reads. */
export interface VideoLoadRequest {
  url: string;
  /** iOS only. False for loads inside an iframe (consent prompts, ads, players). */
  isTopFrame?: boolean;
  /** iOS only (`other` on Android). `click` means the person tapped a link. */
  navigationType?: string;
}

export const VIDEO_EMBED_HOST = 'www.youtube-nocookie.com';

const WEB_SCHEMES = new Set(['https:', 'http:']);
/** Schemes a player builds its own frames from; they never leave the device. */
const LOCAL_FRAME_SCHEMES = new Set(['about:', 'blob:', 'data:']);

/**
 * The base URL is only a label for the HTML the app hands the WebView; nothing should ever be
 * fetched from it. iOS asks about it once, as a plain top-level load, when that HTML is loaded. A
 * reload or a back/forward step to it would request it over the network instead, and a frame that
 * points at it would too, so those are refused rather than sent to a host the app does not run.
 */
function pageLoadDecision(request: VideoLoadRequest): VideoLoadDecision {
  const initialLoad = request.navigationType === undefined || request.navigationType === 'other';
  return request.isTopFrame !== false && initialLoad ? 'allow' : 'block';
}

/**
 * The single gate for every load in the tutorial player, in every frame. The WebView's own origin
 * list is left wide open so this function sees everything, including the frames the player builds
 * locally.
 */
export function decideVideoLoad(
  request: VideoLoadRequest,
  embedHost: string = VIDEO_EMBED_HOST,
): VideoLoadDecision {
  if (request.url === 'about:blank') return 'allow';
  if (request.url === VIDEO_PAGE_URL) return pageLoadDecision(request);
  let target: URL;
  try {
    target = new URL(request.url);
  } catch {
    return 'block';
  }
  if (target.protocol === 'https:' && target.hostname === embedHost) return 'allow';
  if (request.isTopFrame === false) {
    // Frames inside the player load where they are; they never take over the screen, and no
    // sub-frame load, tapped or not, ever opens another app.
    const inPlace = WEB_SCHEMES.has(target.protocol) || LOCAL_FRAME_SCHEMES.has(target.protocol);
    return inPlace ? 'allow' : 'block';
  }
  const tapped = request.navigationType === 'click';
  return tapped && WEB_SCHEMES.has(target.protocol) ? 'external' : 'block';
}
