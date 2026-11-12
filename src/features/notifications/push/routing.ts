/**
 * Reads the routing fields the push function puts in each message's `data` and decides where a
 * tap should go. Payloads are untrusted input: anything malformed simply opens the inbox.
 */
import type { Href } from 'expo-router';
import { z } from 'zod';

import { notificationTarget } from '../describe';
import { NOTIFICATION_KINDS } from '../model';

const optionalId = z.string().min(1).max(128).nullish().catch(null);

export const PushDataSchema = z.object({
  notification_id: z.string().min(1).max(128),
  recipient_id: z.string().min(1).max(128),
  kind: z.enum(NOTIFICATION_KINDS),
  actor_id: optionalId,
  post_id: optionalId,
  comment_id: optionalId,
  action_id: optionalId,
});

export type PushData = z.infer<typeof PushDataSchema>;

export function parsePushData(data: unknown): PushData | null {
  const parsed = PushDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export interface PushTap {
  /** Where to navigate. */
  href: Href;
  /** Inbox entry to mark read, when the push belongs to the signed-in account. */
  notificationId: string | null;
}

/**
 * Destination for a tapped push. A push meant for another account (the device changed hands
 * without signing out) opens the inbox and marks nothing read.
 */
export function resolvePushTap(data: unknown, currentUserId: string | null): PushTap {
  const parsed = parsePushData(data);
  if (!parsed || !currentUserId || parsed.recipient_id !== currentUserId) {
    return { href: '/notifications', notificationId: null };
  }
  const href =
    notificationTarget({
      kind: parsed.kind,
      actor_id: parsed.actor_id ?? null,
      post_id: parsed.post_id ?? null,
      comment_id: parsed.comment_id ?? null,
      action_id: parsed.action_id ?? null,
    }) ?? '/notifications';
  return { href, notificationId: parsed.notification_id };
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * The recipe id in an in-app cook route such as `/cook/mealdb%3A1`, decoded, or null when the
 * route is anything else or its escapes are malformed.
 */
export function cookSessionIdFromUrl(url: string): string | null {
  const match = /^\/cook\/([^/?#]+)\/?$/.exec(url);
  const id = match?.[1] ? decodeSegment(match[1]) : null;
  return id || null;
}

/**
 * The parts of a navigation state this module reads. React Navigation's full and partial states
 * both fit it; a partial state without `index` focuses its last route.
 */
export interface NavStateLike {
  readonly index?: number | undefined;
  readonly routes: readonly NavRouteLike[];
}

interface NavRouteLike {
  readonly name: string;
  readonly params?: object | undefined;
  readonly state?: NavStateLike | undefined;
}

/** Where a cook session sits in the app's navigation, as seen from a tapped timer alert. */
export type CookSessionPlacement =
  /** The session, or its finish screen, is what the person is looking at. */
  | 'onScreen'
  /**
   * The session is below the focused screen and no other cook screen is in the way, so going back
   * to it closes only screens outside the cook flow.
   */
  | 'underneath'
  /**
   * The session is open further down, but another cook screen is showing or sits between it and
   * the focused screen: another recipe's session or finish screen, or any finish screen. Going back
   * would close or rewrite that screen, so a new session screen is opened instead.
   */
  | 'behindAnotherSession'
  /** No screen for this session is open. */
  | 'absent';

const SESSION_ROUTE = /^cook\/\[id\](?:\/index)?$/;
const FINISH_ROUTE = /^cook\/\[id\]\/done$/;

function isCookRoute(route: NavRouteLike): boolean {
  return SESSION_ROUTE.test(route.name) || FINISH_ROUTE.test(route.name);
}

function isRouteFor(route: NavRouteLike, pattern: RegExp, recipeId: string): boolean {
  if (!pattern.test(route.name)) return false;
  const id = (route.params as { id?: unknown } | undefined)?.id;
  if (typeof id !== 'string') return false;
  return id === recipeId || decodeSegment(id) === recipeId;
}

/**
 * Finds the cook session for `recipeId` along the focused path of `state`. Only the focused screen
 * and the screens below it count: a session in another tab or a dismissed screen does not.
 *
 * Going back to a session pops to the focused screen when it has the session's route name, or else
 * to the nearest screen below with that name, whatever its recipe, and then rewrites that screen's
 * recipe. So every cook screen that is not this recipe's session is a barrier: another recipe's
 * session would be rewritten or closed, and a finish screen holds a cook that is not saved yet.
 * `underneath` is reported only when the nearest cook screen below a focused non-cook screen
 * (deeper navigators are nearer) is this recipe's session.
 */
export function findCookSession(
  state: NavStateLike | undefined,
  recipeId: string,
): CookSessionPlacement {
  // Screens below the focus, one list per navigator from the outermost in, each bottom to top.
  const below: (readonly NavRouteLike[])[] = [];
  let focusedLeaf: NavRouteLike | null = null;
  let current = state;
  while (current && current.routes.length > 0) {
    const focusedIndex = current.index ?? current.routes.length - 1;
    const focused = current.routes[focusedIndex];
    if (!focused) break;
    below.push(current.routes.slice(0, focusedIndex));
    if (!focused.state) {
      focusedLeaf = focused;
      break;
    }
    current = focused.state;
  }

  let blocked = false;
  if (focusedLeaf && isCookRoute(focusedLeaf)) {
    const ownFlow =
      isRouteFor(focusedLeaf, SESSION_ROUTE, recipeId) ||
      isRouteFor(focusedLeaf, FINISH_ROUTE, recipeId);
    if (ownFlow) return 'onScreen';
    blocked = true;
  }
  for (let level = below.length - 1; level >= 0; level -= 1) {
    const routes = below[level] ?? [];
    for (let i = routes.length - 1; i >= 0; i -= 1) {
      const route = routes[i];
      if (!route || !isCookRoute(route)) continue;
      if (isRouteFor(route, SESSION_ROUTE, recipeId)) {
        return blocked ? 'behindAnotherSession' : 'underneath';
      }
      blocked = true;
    }
  }
  return 'absent';
}
