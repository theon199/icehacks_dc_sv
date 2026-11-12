/**
 * The location flow for Nearby, as a small state machine.
 *
 *   checking ─▶ explain ─▶ requesting ─▶ locating ─▶ located
 *                  │             │            └──▶ unavailable ─▶ manual
 *                  │             └──▶ blocked ──────────────────▶ manual
 *                  └──────────────────────────────────────────────▶ manual
 *
 * We always explain before showing the system prompt, never ask for more than "while using the
 * app", and every dead end offers a city search instead.
 */
import type { LatLng } from './geo';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionSnapshot {
  status: PermissionStatus;
  /** False once the system will no longer show its prompt (the person must use Settings). */
  canAskAgain: boolean;
}

export interface NearbyOrigin {
  point: LatLng;
  source: 'device' | 'city';
  /** City or area name for a manual search; null for the device location. */
  label: string | null;
}

export type LocationState =
  | { step: 'checking' }
  | { step: 'explain' }
  | { step: 'requesting' }
  | { step: 'locating' }
  | { step: 'located'; origin: NearbyOrigin }
  | { step: 'blocked' }
  | { step: 'unavailable' }
  | {
      step: 'manual';
      origin: NearbyOrigin | null;
      reason: 'chosen' | 'blocked' | 'unavailable';
      /** The area searched before "Change" was tapped, so the person can go back to it. */
      previous?: NearbyOrigin;
    };

export type LocationEvent =
  | { type: 'checked'; permission: PermissionSnapshot }
  | { type: 'request' }
  | { type: 'answered'; permission: PermissionSnapshot }
  | { type: 'located'; point: LatLng }
  | { type: 'locateFailed' }
  | { type: 'chooseCity' }
  | { type: 'citySelected'; point: LatLng; label: string }
  | { type: 'useDevice' }
  | { type: 'cancelCity' };

export const initialLocationState: LocationState = { step: 'checking' };

/** What a permission answer means for the flow. */
export function permissionOutcome(permission: PermissionSnapshot): 'granted' | 'ask' | 'blocked' {
  if (permission.status === 'granted') return 'granted';
  if (permission.status === 'undetermined' || permission.canAskAgain) return 'ask';
  return 'blocked';
}

function reasonFor(state: LocationState): 'chosen' | 'blocked' | 'unavailable' {
  if (state.step === 'blocked') return 'blocked';
  if (state.step === 'unavailable') return 'unavailable';
  if (state.step === 'manual') return state.reason;
  return 'chosen';
}

export function locationReducer(state: LocationState, event: LocationEvent): LocationState {
  switch (event.type) {
    case 'checked': {
      // A city the person already picked wins over a late permission check.
      if (state.step === 'manual') return state;
      const outcome = permissionOutcome(event.permission);
      if (outcome === 'granted') return { step: 'locating' };
      return outcome === 'blocked' ? { step: 'blocked' } : { step: 'explain' };
    }
    case 'request':
      return state.step === 'explain' || state.step === 'manual' ? { step: 'requesting' } : state;
    case 'answered': {
      if (state.step !== 'requesting') return state;
      const outcome = permissionOutcome(event.permission);
      if (outcome === 'granted') return { step: 'locating' };
      // A dismissed prompt can be shown again later; a refusal sends people to the city search.
      return outcome === 'blocked' ? { step: 'blocked' } : { step: 'explain' };
    }
    case 'located':
      return state.step === 'locating'
        ? { step: 'located', origin: { point: event.point, source: 'device', label: null } }
        : state;
    case 'locateFailed':
      return state.step === 'locating' ? { step: 'unavailable' } : state;
    case 'chooseCity': {
      const previous = originOf(state);
      return {
        step: 'manual',
        origin: null,
        reason: reasonFor(state),
        ...(previous ? { previous } : {}),
      };
    }
    case 'cancelCity': {
      // Back to the results the person was looking at before tapping "Change".
      if (state.step !== 'manual' || state.origin || !state.previous) return state;
      const { previous } = state;
      return previous.source === 'device'
        ? { step: 'located', origin: previous }
        : { step: 'manual', origin: previous, reason: state.reason };
    }
    case 'citySelected':
      return {
        step: 'manual',
        origin: { point: event.point, source: 'city', label: event.label },
        reason: reasonFor(state),
      };
    case 'useDevice':
      // Re-check rather than assume: access may have been turned on in Settings meanwhile.
      return state.step === 'manual' ? { step: 'checking' } : state;
  }
}

/** The search origin once there is one. */
export function originOf(state: LocationState): NearbyOrigin | null {
  if (state.step === 'located') return state.origin;
  if (state.step === 'manual') return state.origin;
  return null;
}
