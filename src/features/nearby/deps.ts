/**
 * Everything Nearby needs from other features, behind one file.
 *
 * - Who is signed in and whether AI features are open to them come from the auth feature's public
 *   surface.
 * - Ordering tips sit behind an AI gate (18+ and agreement to the AI terms). The app-wide gate
 *   component belongs to the Chef feature; until it ships, `NearbyAiGate` applies the same rule
 *   from the session store, so pointing it at the shared component is a change to this file only.
 */
import type { ReactNode } from 'react';

import { selectCanUseAi, selectIsAdult, useSessionStore } from '@/features/auth';

/** The signed-in person's id, or null while signed out. */
export function useViewerId(): string | null {
  return useSessionStore((state) => state.userId);
}

export type AiAccess = 'allowed' | 'needsConsent' | 'tooYoung';

/** Whether AI features may run for this person, and if not, why. */
export function useAiAccess(): AiAccess {
  return useSessionStore((state) => {
    if (selectCanUseAi(state)) return 'allowed';
    return selectIsAdult(state) ? 'needsConsent' : 'tooYoung';
  });
}

export interface NearbyAiGateProps {
  children: ReactNode;
  /** Shown instead of the children while AI is not available to this person. */
  renderLocked: (access: Exclude<AiAccess, 'allowed'>) => ReactNode;
}

/** Renders AI-powered content only for people who may use it. */
export function NearbyAiGate({ children, renderLocked }: NearbyAiGateProps) {
  const access = useAiAccess();
  return access === 'allowed' ? children : renderLocked(access);
}

/** Route where people review and agree to the AI terms. */
export const AI_CONSENT_ROUTE = '/ai-consent' as const;
