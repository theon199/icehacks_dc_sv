/**
 * The recipe screens' only doorway to other features. Each export is either the sibling feature's
 * public surface or, while that feature is still being built, a neutral stand-in with the same
 * shape (renders nothing, returns null). Swapping a stand-in for the real thing is a one-line
 * change here; nothing else in the recipe feature needs to know.
 */
import { selectAge, selectCanUseAi, useSessionStore } from '@/features/auth';

import type { CompareSide } from './model/compare';

export interface CostSummaryProps {
  recipeId: string;
  /** Servings the estimate should cover. */
  servings?: number;
}

/**
 * Estimated cost of a recipe, provided by the grocery feature. Renders nothing until that feature
 * exports it.
 */
export function CostSummary(_props: CostSummaryProps): null {
  return null;
}

/** Whether AI features may open for this person (18+ and agreed to the AI terms). */
export function useCanUseAi(): boolean {
  return useSessionStore((state) => selectCanUseAi(state));
}

/** The person's age in years, for nutrient targets; null when unknown. */
export function useAge(): number | null {
  return useSessionStore((state) => selectAge(state));
}

/**
 * The person's own healthier version of a recipe, made with "Make it healthier" and kept with
 * their saved recipes. Returns null until the saved store keeps such versions.
 */
export function usePersonalVariant(_recipeId: string | undefined): CompareSide | null {
  return null;
}
