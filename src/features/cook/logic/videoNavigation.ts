/**
 * What the inline tutorial player does with each page load it is asked about. The embed page itself
 * plays in place; a link the cook deliberately taps goes to the system browser; nothing else is
 * allowed to pull them out of cook mode.
 */

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

export function decideVideoLoad(
  request: VideoLoadRequest,
  embedHost: string = VIDEO_EMBED_HOST,
): VideoLoadDecision {
  if (request.url === 'about:blank') return 'allow';
  let target: URL;
  try {
    target = new URL(request.url);
  } catch {
    return 'block';
  }
  if (target.hostname === embedHost) return 'allow';
  // Frames inside the player load where they are; they never take over the screen.
  if (request.isTopFrame === false) return 'allow';
  const tapped = request.navigationType === 'click';
  const web = target.protocol === 'https:' || target.protocol === 'http:';
  return tapped && web ? 'external' : 'block';
}
