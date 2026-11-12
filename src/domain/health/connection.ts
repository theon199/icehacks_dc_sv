/**
 * Which state the health connection is in. Apple Health never reveals whether read access was
 * declined, so "connected" means the permission sheet has been answered; an empty result is shown
 * as "no data yet" rather than as a refusal.
 */

/** What the device can offer: not iOS, iOS without Health (some iPads), or available. */
export type HealthPlatform = 'unsupported' | 'unavailable' | 'available';

/** Whether the permission sheet still needs to be shown for the types Famara reads. */
export type HealthRequestStatus = 'unknown' | 'should_request' | 'answered';

export type HealthConnectionState =
  'unsupported' | 'unavailable' | 'off' | 'needs_permission' | 'connected';

export function resolveHealthConnection(input: {
  platform: HealthPlatform;
  /** The person turned Health on in Famara. */
  enabled: boolean;
  request: HealthRequestStatus;
}): HealthConnectionState {
  if (input.platform === 'unsupported') return 'unsupported';
  if (input.platform === 'unavailable') return 'unavailable';
  if (!input.enabled) return 'off';
  return input.request === 'answered' ? 'connected' : 'needs_permission';
}

/** Data is read only when connected; every other state leaves Health untouched. */
export const canReadHealth = (state: HealthConnectionState) => state === 'connected';
