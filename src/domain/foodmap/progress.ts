/**
 * Claim progress: how much of each region someone has checked into, and which region and spot to
 * aim for next.
 *
 * A region is claimed once every target spot has a check-in. A claim is permanent, so a claimed
 * region counts as complete even if its spot list later grows.
 */

/** Progress as the server reports it. */
export interface RegionProgressInput {
  readonly done: number;
  readonly total: number;
  readonly claimed: boolean;
  readonly claimedAt: string | null;
}

export interface RegionProgress {
  /** Target spots checked into, 0 … `total`. */
  readonly done: number;
  /** Target spots in the region's current list. */
  readonly total: number;
  /** Spots still to visit for a claim; 0 once claimed. */
  readonly remaining: number;
  /** 0 … 1; 1 once claimed, 0 for a region with no spots. */
  readonly fraction: number;
  readonly claimed: boolean;
  readonly claimedAt: string | null;
}

export interface ClaimSpot {
  readonly placeId: string;
  readonly name: string;
  /** 1 is the best spot. */
  readonly rank: number;
  /** The caller's check-ins here. */
  readonly visits: number;
}

/** Whether a region's spot list has been fetched; only `ready` regions can be targeted. */
export type ClaimSpotsStatus = 'ready' | 'pending' | 'unavailable';

export interface ClaimRegion {
  readonly id: string;
  readonly name: string;
  readonly progress: RegionProgressInput;
  readonly spotsStatus: ClaimSpotsStatus;
  readonly spots: readonly ClaimSpot[];
}

export interface ClaimTarget<R extends ClaimRegion = ClaimRegion> {
  readonly region: R;
  readonly spot: R['spots'][number];
  readonly remaining: number;
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Whole, non-negative counts with `done` never above `total`. */
export function regionProgress(input: RegionProgressInput): RegionProgress {
  const total = count(input.total);
  const done = Math.min(count(input.done), total);
  const claimed = input.claimed;
  return {
    done,
    total,
    remaining: claimed ? 0 : total - done,
    fraction: claimed ? 1 : total > 0 ? done / total : 0,
    claimed,
    claimedAt: claimed ? input.claimedAt : null,
  };
}

function firstUnvisited<S extends ClaimSpot>(spots: readonly S[]): S | null {
  let best: S | null = null;
  for (const spot of spots) {
    if (spot.visits > 0) continue;
    if (best === null || spot.rank < best.rank) best = spot;
  }
  return best;
}

/**
 * The unclaimed region closest to a claim and its best spot not yet visited. Regions are ordered by
 * fewest remaining spots, then most done, then name, then id; spots by rank, then list order.
 * Regions whose spots are not `ready`, or with no unvisited spot, are skipped. `null` when nothing is left to aim for.
 */
export function nextClaimTarget<R extends ClaimRegion>(
  regions: readonly R[],
): ClaimTarget<R> | null {
  let best: { target: ClaimTarget<R>; done: number } | null = null;
  for (const region of regions) {
    const progress = regionProgress(region.progress);
    if (region.spotsStatus !== 'ready' || progress.claimed || progress.remaining === 0) continue;
    const spot = firstUnvisited(region.spots);
    if (spot === null) continue;
    const candidate = {
      target: { region, spot, remaining: progress.remaining },
      done: progress.done,
    };
    if (best === null || compareCandidates(candidate, best) < 0) best = candidate;
  }
  return best?.target ?? null;
}

function compareCandidates<R extends ClaimRegion>(
  a: { target: ClaimTarget<R>; done: number },
  b: { target: ClaimTarget<R>; done: number },
): number {
  return (
    a.target.remaining - b.target.remaining ||
    b.done - a.done ||
    a.target.region.name.localeCompare(b.target.region.name) ||
    a.target.region.id.localeCompare(b.target.region.id)
  );
}

/** Regions in the list that the caller has claimed. */
export function claimedCount(regions: readonly Pick<ClaimRegion, 'progress'>[]): number {
  let claimed = 0;
  for (const region of regions) if (region.progress.claimed) claimed++;
  return claimed;
}
