/** What the recipe screen's buttons do. Store writes and navigation only; no rendering. */
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

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

  return useMemo(() => {
    const go = (href: Href) => {
      if (id) router.push(href);
    };
    return {
      saved,
      sheet,
      toggleSave,
      openPlan: () => setSheet('plan'),
      openShop: () => setSheet('shop'),
      closeSheet: () => setSheet(null),
      onPlanned,
      cook: () => go(cookHref(id)),
      openWhy: () => go(whyHref(id)),
      compare: () => go(compareHref(id)),
      makeHealthier: () => go(canUseAi ? makeoverHref(id) : aiConsentHref),
      nearby: () => go(nearbyHref({ id, title })),
      share: () => go(composeHref(id)),
      report: () => go(reportHref({ id, title })),
    };
  }, [id, title, router, canUseAi, saved, sheet, toggleSave, onPlanned]);
}
