import { StyleSheet, View } from 'react-native';

import type { OwnRecipeSafety } from '@/domain/ownRecipes';
import {
  Button,
  Icon,
  Skeleton,
  Text,
  radii,
  space,
  useTheme,
  type IconName,
  type Palette,
} from '@/ui';

import { safetySummary, type SafetyTone } from '../logic/safetyText';

const TONES: Readonly<
  Record<SafetyTone, { bg: keyof Palette; fg: keyof Palette; icon: IconName }>
> = {
  clear: { bg: 'highlightSoft', fg: 'onHighlightSoft', icon: 'checkmark.shield' },
  check: { bg: 'warningSoft', fg: 'onWarningSoft', icon: 'shield' },
  conflict: { bg: 'dangerSoft', fg: 'onDangerSoft', icon: 'exclamationmark.shield' },
  unanswered: { bg: 'warningSoft', fg: 'onWarningSoft', icon: 'shield' },
};

export interface SafetyCardProps {
  /** Null while the ingredients are still being matched to the catalog. */
  safety: OwnRecipeSafety | null;
  /** The one line left to confirm, when there is exactly one. */
  single?: { name: string; onConfirm: () => void } | null;
  onOpenPreferences: () => void;
  testID?: string;
}

/**
 * The safety check of a person's own recipe, in one card: clear, how many lines to confirm, or a
 * conflict. A recipe that is not clear stays out of every suggestion list, and the card says so.
 */
export function SafetyCard({ safety, single, onOpenPreferences, testID }: SafetyCardProps) {
  const theme = useTheme();
  if (!safety) {
    return (
      <View
        style={[styles.card, { backgroundColor: theme.colors.surfaceSunken }]}
        accessible
        accessibilityLabel="Checking ingredients against your allergies and diet"
        testID={testID}
      >
        <Text variant="headline">Checking ingredients…</Text>
        <Skeleton height={14} width="80%" />
      </View>
    );
  }
  const summary = safetySummary(safety);
  const tone = TONES[summary.tone];
  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors[tone.bg] }]}
      testID={testID}
      accessibilityLiveRegion="polite"
    >
      <View
        style={styles.title}
        accessible
        accessibilityLabel={`${summary.title}. ${summary.message}`}
      >
        <Icon name={tone.icon} size={20} color={tone.fg} />
        <Text variant="headline" color={tone.fg} style={styles.flex}>
          {summary.title}
        </Text>
      </View>
      <Text variant="subhead" color={tone.fg} accessible={false}>
        {summary.message}
      </Text>
      {summary.tone === 'unanswered' ? (
        <Button
          label="Open preferences"
          size="sm"
          variant="primary"
          onPress={onOpenPreferences}
          style={styles.action}
          testID="safety-open-preferences"
        />
      ) : summary.tone === 'check' && single ? (
        <Button
          label={`Confirm the ${single.name}`}
          size="sm"
          variant="primary"
          onPress={single.onConfirm}
          accessibilityHint="Says you checked this ingredient against your allergies and diet"
          style={styles.action}
          testID="safety-confirm-single"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, padding: space.lg, gap: space.sm },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  action: { alignSelf: 'flex-start', marginTop: space.xs },
});
