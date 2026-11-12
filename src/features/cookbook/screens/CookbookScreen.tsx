import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SegmentedControl, Screen, space } from '@/ui';

import { PlanTab } from '../components/PlanTab';
import { SavedTab } from '../components/SavedTab';
import { useToday } from '../hooks/useToday';

export type CookbookView = 'saved' | 'plan';

const SEGMENTS = [
  { value: 'saved', label: 'Saved' },
  { value: 'plan', label: 'Plan' },
] as const;

export interface CookbookScreenProps {
  initialView?: CookbookView;
}

/** The Cookbook tab: saved recipes and the weekly planner behind one switch. */
export function CookbookScreen({ initialView = 'saved' }: CookbookScreenProps) {
  const [view, setView] = useState<CookbookView>(initialView);
  const today = useToday();
  const header = (
    <View style={styles.switch}>
      <SegmentedControl
        accessibilityLabel="Cookbook view"
        segments={SEGMENTS}
        value={view}
        onChange={setView}
        testID="cookbook-view"
      />
    </View>
  );
  return (
    <Screen scroll={false} padded={false} testID="cookbook-screen">
      {view === 'saved' ? (
        <SavedTab header={header} today={today} />
      ) : (
        <PlanTab header={header} today={today} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switch: { paddingTop: space.xs },
});
