import { RECIPE_IMPORT_LIMITS } from '@/lib/api/ai';

/**
 * A pasted link as the import function accepts it: http(s), trimmed, and with `https://` added
 * when someone pastes a bare address such as "seriouseats.com/adobo". Null when it is not a link.
 * Which hosts may be opened is decided on the server.
 */
export function normalizeLink(input: string): string | null {
  const text = input.trim();
  if (text === '' || /\s/.test(text) || text.length > RECIPE_IMPORT_LIMITS.urlMaxChars) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href.length > RECIPE_IMPORT_LIMITS.urlMaxChars ? null : url.href;
  } catch {
    return null;
  }
}

/** The first link in some pasted text, for the clipboard button. */
export function firstLink(text: string): string | null {
  const match = /https?:\/\/\S+/i.exec(text);
  return normalizeLink(match ? match[0] : text);
}
