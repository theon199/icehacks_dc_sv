/**
 * The four steps for mounting the phone in an upper cabinet so the coach can see the counter:
 * the phone lies screen down on the bottom shelf with a third past the edge, held by a plate.
 * After the last step comes the view check, then cooking.
 */
export type SetupArt = 'door' | 'phone' | 'plate' | 'view';

export interface SetupStep {
  art: SetupArt;
  title: string;
  body: string;
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    art: 'door',
    title: 'Open the cabinet above your counter',
    body: "Swing the door all the way open so it can't knock the phone.",
  },
  {
    art: 'phone',
    title: 'Lay your phone on the bottom shelf',
    body: 'Screen down, camera end out. Let about a third hang past the edge, over the counter.',
  },
  {
    art: 'plate',
    title: 'Set a plate on top',
    body: 'A heavy dinner plate on the part inside the cabinet keeps the phone from tipping.',
  },
  {
    art: 'view',
    title: 'Check what it sees',
    body: 'The camera looks straight down. Your stove and prep space should both be in view.',
  },
];

/** Steps 0..3 are the illustrated cards; this index is the live view check that follows them. */
export const VIEW_CHECK = SETUP_STEPS.length;

export type SetupPosition = number;

export function nextPosition(position: SetupPosition): SetupPosition {
  return Math.min(VIEW_CHECK, position + 1);
}

/** Going back from the first card leaves setup, signalled by `null`. */
export function previousPosition(position: SetupPosition): SetupPosition | null {
  return position <= 0 ? null : position - 1;
}

export type CoachDestination = 'coach' | 'cook';

/**
 * Where "Start cooking" leads. The coach answers with AI, so without the 18+ and consent check it
 * falls back to the step-by-step cook mode, which still has voice "next" and timers.
 */
export function startDestination(canUseAi: boolean): CoachDestination {
  return canUseAi ? 'coach' : 'cook';
}
