/**
 * Toast copy for writes into the meal plan, shared by the planning screens and the day view so an
 * archived week reads the same wherever a change was refused.
 */

/** Shown when an archived week refused a change; archived weeks take no writes until restored. */
export const ARCHIVED_WEEK_MESSAGE = 'That week is archived. Restore it to plan meals.';

export interface PlanToast {
  readonly message: string;
  readonly tone: 'success' | 'neutral';
}

/**
 * The toast after copying planner output into the plan, from how many meals were offered, how
 * many landed, and whether an archived week (which takes no writes) was among the targets.
 */
export function addedToPlanToast({
  offered,
  placed,
  archived,
}: {
  offered: number;
  placed: number;
  archived: boolean;
}): PlanToast {
  if (placed === 0) {
    return {
      message: archived ? ARCHIVED_WEEK_MESSAGE : 'Those meals are already planned',
      tone: 'neutral',
    };
  }
  const added = placed === 1 ? 'Added 1 meal to your plan' : `Added ${placed} meals to your plan`;
  if (placed >= offered) return { message: added, tone: 'success' };
  return {
    message: archived
      ? `${added}. An archived week was left as it is.`
      : `${added}. The rest had been planned in the meantime.`,
    tone: 'success',
  };
}
