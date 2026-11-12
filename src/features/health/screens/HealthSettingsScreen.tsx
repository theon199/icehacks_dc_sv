import { useState } from 'react';
import { RefreshControl } from 'react-native';

import { Screen, Text, useTheme } from '@/ui';

import { DayContextCard } from '../components/DayContextCard';
import { GlucoseInsightsCard } from '../components/GlucoseInsightsCard';
import { HealthConnections } from '../components/HealthConnections';
import { healthCopy } from '../copy';
import { useHealthStore } from '../healthStore';
import { refreshHealth } from '../refresh';
import { useDayContext } from '../useDayContext';
import { useGlucoseInsights } from '../useGlucoseInsights';

/** Settings › Health: connect Apple Health, see today's context and dish glucose insights. */
export function HealthSettingsScreen() {
  const theme = useTheme();
  const enabled = useHealthStore((state) => state.enabled);
  const { context } = useDayContext();
  const { summary, titles } = useGlucoseInsights();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshHealth({ force: true });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen
      testID="health-screen"
      {...(enabled
        ? {
            refreshControl: (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor={theme.colors.primary}
              />
            ),
          }
        : {})}
    >
      <Text variant="subhead" tone="muted">
        {healthCopy.intro}
      </Text>
      <HealthConnections />
      {enabled ? (
        <>
          <DayContextCard context={context} />
          <GlucoseInsightsCard summary={summary} titles={titles} />
          <Text variant="footnote" tone="subtle">
            {healthCopy.privacy}
          </Text>
        </>
      ) : null}
      <Text variant="footnote" tone="subtle">
        {healthCopy.disclaimer}
      </Text>
    </Screen>
  );
}
