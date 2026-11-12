/** What the recipe screen's buttons do. Store writes and navigation only; no rendering. */
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import type { RecipeSummary } from '@/lib/catalog';
import { selectIsSaved, useFeedbackStore, useSavedStore } from '@/stores';
import { toast } from '@/ui';

import type { PlannedSlot, PlanSheetPurpose } from '../components/PlanSlotSheet';
import { useCanUseAi } from '../deps';
import {
  aiConsentHref,
  compareHref,
  composeHref,
  cookbookHref,
  cookHref,
  makeoverHref,
  nearbyHref,
  reportHref,
  shoppingHref,
  whyHref,
} from '../links';
import { DAY_SHORT, MEAL_LABELS } from '../model/planSlot';

export function useRecipeActions(recipe: Pick<RecipeSummary, 'id' | 'title'> | null) {
  const router = useRouter();
  const id = recipe?.id ?? '';
  const title = recipe?.title ?? '';
  const saved = useSavedStore(selectIsSaved(id));
  const toggleSaved = useSavedStore((state) => state.toggle);
  const recordFeedback = useFeedbackStore((state) => state.record);
  const canUseAi = useCanUseAi();
  const [sheet, setSheet] = useState<PlanSheetPurpose | null>(null);

  const toggleSave = useCallback(() => {
    if (!id) return;
    const nowSaved = toggleSaved(id);
    recordFeedback({ recipeId: id, kind: nowSaved ? 'save' : 'unsave' });
    toast.show({
      message: nowSaved ? 'Saved to your cookbook' : 'Removed from your cookbook',
      tone: nowSaved ? 'success' : 'neutral',
    });
  }, [id, toggleSaved, recordFeedback]);

  const onPlanned = useCallback(
    (slot: PlannedSlot) => {
      const purpose = sheet;
      setSheet(null);
      const when = `${DAY_SHORT[slot.day]} ${MEAL_LABELS[slot.meal].toLowerCase()}`;
      if (purpose === 'shop') {
        toast.success(`Planned for ${when}; its ingredients are on your list`);
        router.push(shoppingHref);
        return;
      }
      toast.show({
        message: `Planned for ${when}`,
        tone: 'success',
        action: { label: 'View plan', onPress: () => router.push(cookbookHref) },
      });
    },
    [router, sheet],
  );

  const push = router.push;
  return {
    saved,
    sheet,
    toggleSave,
    openPlan: useCallback(() => setSheet('plan'), []),
    openShop: useCallback(() => setSheet('shop'), []),
    closeSheet: useCallback(() => setSheet(null), []),
    onPlanned,
    cook: useCallback(() => id && push(cookHref(id)), [id, push]),
    openWhy: useCallback(() => id && push(whyHref(id)), [id, push]),
    compare: useCallback(() => id && push(compareHref(id)), [id, push]),
    makeHealthier: useCallback(() => {
      if (!id) return;
      push(canUseAi ? makeoverHref(id) : aiConsentHref);
    }, [id, push, canUseAi]),
    nearby: useCallback(() => id && push(nearbyHref({ id, title })), [id, title, push]),
    share: useCallback(() => id && push(composeHref(id)), [id, push]),
    report: useCallback(() => id && push(reportHref({ id, title })), [id, title, push]),
  };
}
