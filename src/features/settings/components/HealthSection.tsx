import { useRouter } from 'expo-router';

import { Card, ListRow } from '@/ui';

import { HealthConnections } from '../deps';
import { SettingsSection } from './SettingsSection';

/**
 * Apple Health: the connection card from the health feature, then a way into the Health screen,
 * which shows today's context and how dishes have affected glucose.
 */
export function HealthSection() {
  const router = useRouter();
  return (
    <SettingsSection
      title="Health"
      bare
      testID="settings-health"
      footnote="Health insights are for information only, not medical advice."
    >
      <HealthConnections />
      <Card padding="md">
        <ListRow
          testID="settings-health-insights"
          title="Health insights"
          subtitle="Today's context and how dishes affected your glucose"
          icon="chart.bar"
          onPress={() => router.push('/health')}
        />
      </Card>
    </SettingsSection>
  );
}
