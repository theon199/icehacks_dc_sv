import { StyleSheet, View } from 'react-native';

import { Button, Icon, Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

export interface SafetyNoticeProps {
  onSetUp: () => void;
}

/**
 * Shown while the person has not told us about allergies and diets. Until they do, no recipe can
 * be confirmed safe, so every result carries a badge; this explains why and how to fix it.
 */
export function SafetyNotice({ onSetUp }: SafetyNoticeProps) {
  const theme = useTheme();
  return (
    <View
      testID="safety-notice"
      style={[
        styles.card,
        { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.lg },
      ]}
    >
      <View style={styles.row}>
        <Icon name="exclamationmark.shield" android="shield" size={22} color="onWarningSoft" />
        <View style={styles.text}>
          <Text variant="headline" color="onWarningSoft">
            Tell us about allergies first
          </Text>
          <Text variant="footnote" color="onWarningSoft">
            Until you do, we can’t confirm any recipe is safe for you, so each one is marked.
          </Text>
        </View>
      </View>
      <Button label="Set allergies and diets" size="sm" variant="secondary" onPress={onSetUp} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md, marginBottom: space.md },
  row: { flexDirection: 'row', gap: space.md },
  text: { flex: 1, gap: space.xxs },
});
