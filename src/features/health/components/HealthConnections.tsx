import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text, Toggle, space } from '@/ui';

import { healthCopy } from '../copy';
import { useHealthConnection } from '../useHealthConnection';

const copy = healthCopy.connection;

/**
 * The Apple Health connection card: status, the permission flow and the sync opt-in. Settings
 * mounts this directly; the Health screen shows it above the insights.
 */
export function HealthConnections() {
  const { state, busy, syncEnabled, connect, disconnect, setSyncEnabled } = useHealthConnection();
  const status = state === 'checking' ? copy.checking : copy.states[state];
  const live = state === 'connected' || state === 'needs_permission';

  return (
    <Card testID="health-connections">
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Icon name="heart.text.square" color="accent" size={24} />
          <Text variant="headline" style={styles.flex}>
            {copy.title}
          </Text>
        </View>
        <Text variant="subhead" tone="muted" accessibilityLiveRegion="polite">
          {status}
        </Text>

        {state === 'off' ? (
          <Button
            label={copy.connect}
            icon="heart"
            onPress={() => void connect()}
            loading={busy}
            testID="health-connect"
          />
        ) : null}

        {state === 'needs_permission' ? (
          <Button
            label={copy.allow}
            onPress={() => void connect()}
            loading={busy}
            testID="health-allow"
          />
        ) : null}

        {state === 'connected' ? (
          <Toggle
            label={copy.sync}
            description={copy.syncHint}
            value={syncEnabled}
            onValueChange={setSyncEnabled}
            testID="health-sync"
          />
        ) : null}

        {live ? (
          <Button
            label={copy.disconnect}
            variant="ghost"
            size="sm"
            onPress={disconnect}
            accessibilityHint={copy.disconnectHint}
            testID="health-disconnect"
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
