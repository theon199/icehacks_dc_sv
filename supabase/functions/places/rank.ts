/**
 * Orders nearby restaurants for a dish by proximity × community confirmation.
 *
 *   proximity    = 1 / (1 + km)                    1 next door, 0.5 at 1 km, 0.11 at 8 km
 *   confirmation = (yes + 1) / (yes + no + 2)       0.5 with no answers; moves with evidence
 *   score        = proximity × 2 × confirmation     a place nobody has rated keeps its proximity
 *
 * Ties are broken by rating (weighted towards 4.0 when there are few reviews), then distance.
 */

import { distanceMeters } from "./geo.ts";

export interface Place {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  rating_count: number | null;
  price_level: number | null;
  open_now: boolean | null;
  primary_type: string | null;
}

export interface Confirmation {
  yes_count: number;
  no_count: number;
  my_answer: boolean | null;
}

export interface RankedPlace extends Place, Confirmation {
  distance_m: number;
  score: number;
}

export function proximity(distanceM: number): number {
  return 1 / (1 + Math.max(0, distanceM) / 1000);
}

export function confirmation(yes: number, no: number): number {
  return (yes + 1) / (yes + no + 2);
}

/** Review score pulled towards 4.0 by the equivalent of 20 reviews. */
function weightedRating(place: Place): number {
  if (place.rating === null) return 0;
  const count = place.rating_count ?? 0;
  return (place.rating * count + 4 * 20) / (count + 20);
}

/**
 * Ranks the places within `radiusM` of `origin`, best first, keeping at most `limit`.
 */
export function rankPlaces(
  places: readonly Place[],
  confirmations: ReadonlyMap<string, Confirmation>,
  origin: { lat: number; lng: number },
  radiusM: number,
  limit: number,
): RankedPlace[] {
  const ranked: Array<RankedPlace & { tie: number }> = [];
  for (const place of places) {
    const distance = distanceMeters(origin, place);
    if (distance > radiusM) continue;
    const votes = confirmations.get(place.id) ?? { yes_count: 0, no_count: 0, my_answer: null };
    const score = proximity(distance) * 2 * confirmation(votes.yes_count, votes.no_count);
    ranked.push({
      ...place,
      ...votes,
      distance_m: Math.round(distance),
      score: Math.round(score * 10_000) / 10_000,
      tie: weightedRating(place),
    });
  }
  ranked.sort((a, b) => b.score - a.score || b.tie - a.tie || a.distance_m - b.distance_m);
  return ranked.slice(0, limit).map(({ tie: _tie, ...place }) => place);
}
