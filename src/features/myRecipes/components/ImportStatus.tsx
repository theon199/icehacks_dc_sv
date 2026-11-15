import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text, space, useTheme } from '@/ui';

import type { ImportPhase } from '../hooks/useRecipeImport';

export interface ImportStatusProps {
  phase: Exclude<ImportPhase, { status: 'idle' }>;
  onCancel: () => void;
  onRetry: () => void;
}

const WORKING: Readonly<Record<'link' | 'photo' | 'text', string>> = {
  link: 'Reading the page…',
  photo: 'Reading your card…',
  text: 'Reading your recipe…',
};

/** Where an import stands: working, nothing found, or a problem with what to do next. */
export function ImportStatus({ phase, onCancel, onRetry }: ImportStatusProps) {
  const theme = useTheme();
  if (phase.status === 'working') {
    const label = phase.stage === 'preparing' ? 'Getting the photo ready…' : WORKING[phase.source];
    return (
      <Card testID="import-working">
        <View
          style={styles.row}
          accessible
          accessibilityLabel={label}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={theme.colors.text} />
          <Text variant="headline" style={styles.flex}>
            {label}
          </Text>
        </View>
        <Text variant="subhead" tone="muted" style={styles.gap}>
          This can take up to a minute for a long recipe.
        </Text>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onCancel} style={styles.action} />
      </Card>
    );
  }
  const title =
    phase.status === 'not_recipe'
      ? phase.reason === 'blocked_source'
        ? "Famara can't open that link"
        : phase.reason === 'unreadable'
          ? "Couldn't read that"
          : 'No recipe found'
      : phase.problem.title;
  const message = phase.status === 'not_recipe' ? phase.message : phase.problem.message;
  const canRetry = phase.status === 'failed' && phase.problem.canRetry;
  return (
    <Card variant="sunken" testID="import-problem">
      <View style={styles.row} accessible accessibilityLabel={`${title}. ${message}`}>
        <Icon name="exclamationmark.circle" size={20} color="textMuted" />
        <Text variant="headline" style={styles.flex}>
          {title}
        </Text>
      </View>
      <Text variant="subhead" tone="muted" style={styles.gap} accessible={false}>
        {message}
      </Text>
      <View style={styles.actions}>
        {canRetry ? (
          <Button label="Try again" size="sm" onPress={onRetry} testID="import-retry" />
        ) : null}
        <Button
          label={canRetry ? 'Dismiss' : 'Try something else'}
          size="sm"
          variant={canRetry ? 'ghost' : 'secondary'}
          onPress={onCancel}
          testID="import-dismiss"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  gap: { marginTop: space.xs },
  action: { alignSelf: 'flex-start', marginTop: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
});
