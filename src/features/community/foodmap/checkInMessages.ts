/**
 * The sentences a check-in ends with: what it counted for, or why it did not count.
 */
import type { CheckInRejection, CheckInResponse } from '@/lib/api/foodMap';

export interface CheckInOutcome {
  readonly message: string;
  /** A claim is the moment to mark; everything else is a plain confirmation. */
  readonly claimed: boolean;
}

/** "Pico claimed. Every healthy spot checked · 2 of 7" or "Checked in at Saigon Herb. …". */
export function checkInSuccessMessage(
  placeName: string,
  result: CheckInResponse,
  regionsOnMap: { claimed: number; total: number },
): CheckInOutcome {
  const claim = result.claimedRegions[0];
  if (result.claimedNow && claim) {
    const count =
      regionsOnMap.total > 0 ? ` · ${regionsOnMap.claimed} of ${regionsOnMap.total}` : '';
    return { message: `${claim.name} claimed. Every healthy spot checked${count}`, claimed: true };
  }
  const region = result.region;
  if (result.visitsHere > 1) {
    return {
      message: `Checked in at ${placeName}. ${result.visitsHere} check-ins here`,
      claimed: false,
    };
  }
  if (region && region.total > 0 && !region.claimed) {
    return {
      message: `Checked in at ${placeName}. ${region.name}: ${region.done} of ${region.total} healthy spots`,
      claimed: false,
    };
  }
  return { message: `Checked in at ${placeName}`, claimed: false };
}

/** Why the server did not count a check-in, in words; times in the device's own format. */
export function checkInRejectionMessage(
  rejection: CheckInRejection,
  formatDistance: (meters: number) => string,
  formatTime: (iso: string) => string,
): string {
  switch (rejection.reason) {
    case 'too_far':
      return `You're ${formatDistance(rejection.distanceM)} away. Check in when you're at the place.`;
    case 'rate_limited':
      return rejection.limit === 'cooldown'
        ? `You checked in here recently. You can check in again at ${formatTime(rejection.retryAt)}.`
        : `That's all of today's check-ins. You can check in again at ${formatTime(rejection.retryAt)}.`;
    case 'not_found':
      return "This place couldn't be found any more. Refresh the map and try again.";
  }
}
