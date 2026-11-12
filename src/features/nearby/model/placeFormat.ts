/**
 * Display helpers for a place: rating, price level, opening state, directions and contact links.
 */
import type { LatLng } from './geo';

/** "$$" for a 1–4 price level; null when unknown or free. */
export function priceLabel(level: number | null): string | null {
  if (level == null || !Number.isInteger(level) || level < 1 || level > 4) return null;
  return '$'.repeat(level);
}

export function priceAccessibilityLabel(level: number | null): string | null {
  const label = priceLabel(level);
  return label ? `Price level ${label.length} of 4` : null;
}

/** A 0–5 rating to one decimal, as it is shown and sent; null when missing. */
export function ratingValue(rating: number | null): number | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  return Math.round(Math.min(5, rating) * 10) / 10;
}

/** "4.6" for a 0–5 rating; null when missing. */
export function ratingLabel(rating: number | null): string | null {
  return ratingValue(rating)?.toFixed(1) ?? null;
}

/** "1.2k" style review counts so a card stays one line. */
export function reviewCountLabel(count: number | null): string | null {
  if (count == null || count <= 0) return null;
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, '') : Math.round(thousands)}k`;
}

export type OpenState = 'open' | 'closed' | 'unknown';

export function openState(openNow: boolean | null): OpenState {
  if (openNow === true) return 'open';
  if (openNow === false) return 'closed';
  return 'unknown';
}

/** Apple Maps directions from the current location to the place, labelled with its name. */
export function directionsUrl(place: { name: string } & LatLng): string {
  // Built by hand: React Native's URL classes only partly implement the web API.
  const daddr = `${place.latitude.toFixed(6)},${place.longitude.toFixed(6)}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(daddr)}&q=${encodeURIComponent(place.name)}&dirflg=d`;
}

/** A `tel:` link for a listed phone number, keeping only dialable characters. */
export function phoneUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const dialable = phone.replace(/[^\d+]/g, '');
  return dialable.replace(/\D/g, '').length >= 5 ? `tel:${dialable}` : null;
}

/** An http(s) website link, or null for anything else. */
export function websiteUrl(website: string | null | undefined): string | null {
  const trimmed = website?.trim();
  if (!trimmed) return null;
  return /^https?:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i.test(trimmed) ? trimmed : null;
}

/** Short summary of member answers: "3 of 4 members found it here". */
export function tallyLabel(yesCount: number, noCount: number): string | null {
  const total = yesCount + noCount;
  if (total <= 0) return null;
  const noun = total === 1 ? 'member' : 'members';
  if (yesCount === 0) return `${total} ${noun} didn't find it here`;
  return `${yesCount} of ${total} ${noun} found it here`;
}
