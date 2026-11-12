import { Alert } from 'react-native';

import type { IsoDate } from '@/domain/plan';
import { ListRow, toast } from '@/ui';

import { plannerActions } from '../hooks/usePlanner';

export interface PlanWeekMenuProps {
  weekStart: IsoDate;
  hasMeals: boolean;
  archived: boolean;
}

/** Whole-week actions under the planner: archive it or clear it. Both ask first. */
export function PlanWeekMenu({ weekStart, hasMeals, archived }: PlanWeekMenuProps) {
  if (!hasMeals || archived) return null;
  const archive = () => {
    plannerActions.archive(weekStart);
    toast.show({
      message: 'Week archived',
      action: { label: 'Undo', onPress: () => plannerActions.restore(weekStart) },
    });
  };
  const clear = () =>
    Alert.alert('Clear this week?', 'Every meal planned for this week will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear week',
        style: 'destructive',
        onPress: () => plannerActions.clearWeek(weekStart),
      },
    ]);
  return (
    <>
      <ListRow
        title="Archive this week"
        icon="archivebox"
        onPress={archive}
        divider
        testID="archive-week"
      />
      <ListRow
        title="Clear this week"
        icon="trash"
        destructive
        onPress={clear}
        testID="clear-week"
      />
    </>
  );
}
