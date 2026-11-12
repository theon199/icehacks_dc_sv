/**
 * The shape the map, cards and sheet render: a place from the search with its distance measured
 * from the current origin and its labels computed once.
 */
import { distanceMeters, formatDistance, type DistanceUnit, type LatLng } from './geo';
import {
  openState,
  priceAccessibilityLabel,
  priceLabel,
  ratingLabel,
  ratingValue,
  reviewCountLabel,
  type OpenState,
} from './placeFormat';

/** The fields Nearby uses from a search result. */
export interface NearbyPlaceInput {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: number | null;
  openNow: boolean | null;
  primaryType: string | null;
  yesCount: number;
  noCount: number;
  myAnswer: boolean | null;
  phone?: string | null;
  website?: string | null;
}

export interface PlaceView {
  id: string;
  name: string;
  address: string | null;
  point: LatLng;
  distanceM: number;
  distance: string;
  /** The rating as shown ("4.6"); display only. */
  rating: string | null;
  /** The same rating as a number, for anything that computes with or sends it. */
  ratingValue: number | null;
  reviews: string | null;
  price: string | null;
  priceA11y: string | null;
  open: OpenState;
  /** "Thai restaurant" from the place's primary type. */
  kind: string | null;
  yesCount: number;
  noCount: number;
  myAnswer: boolean | null;
  phone: string | null;
  website: string | null;
}

/** `"thai_restaurant"` → `"Thai restaurant"`. */
export function kindLabel(primaryType: string | null): string | null {
  if (!primaryType) return null;
  const words = primaryType.replace(/_/g, ' ').trim();
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toPlaceView(
  place: NearbyPlaceInput,
  origin: LatLng | null,
  unit: DistanceUnit,
): PlaceView {
  const point = { latitude: place.lat, longitude: place.lng };
  const distanceM = origin ? distanceMeters(origin, point) : place.distanceM;
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    point,
    distanceM,
    distance: formatDistance(distanceM, unit),
    rating: ratingLabel(place.rating),
    ratingValue: ratingValue(place.rating),
    reviews: reviewCountLabel(place.ratingCount),
    price: priceLabel(place.priceLevel),
    priceA11y: priceAccessibilityLabel(place.priceLevel),
    open: openState(place.openNow),
    kind: kindLabel(place.primaryType),
    yesCount: place.yesCount,
    noCount: place.noCount,
    myAnswer: place.myAnswer,
    phone: place.phone ?? null,
    website: place.website ?? null,
  };
}

/** One line for VoiceOver that covers what a card shows. */
export function placeAccessibilityLabel(place: PlaceView): string {
  const parts = [place.name];
  if (place.distance) parts.push(`${place.distance} away`);
  if (place.rating) parts.push(`rated ${place.rating}`);
  if (place.open === 'open') parts.push('open now');
  if (place.open === 'closed') parts.push('closed now');
  if (place.priceA11y) parts.push(place.priceA11y);
  return parts.join(', ');
}

/**
 * What the facts row shows, read as one phrase: "Rated 4.5 from 80 reviews, 350 m away, open now,
 * Price level 2 of 4". Null when the row shows nothing.
 */
export function placeFactsLabel(place: PlaceView): string | null {
  const parts: string[] = [];
  if (place.rating) {
    parts.push(
      place.reviews
        ? `Rated ${place.rating} from ${place.reviews} reviews`
        : `Rated ${place.rating}`,
    );
  }
  if (place.distance) parts.push(`${place.distance} away`);
  if (place.open === 'open') parts.push('open now');
  if (place.open === 'closed') parts.push('closed now');
  if (place.priceA11y) parts.push(place.priceA11y);
  return parts.length > 0 ? parts.join(', ') : null;
}
