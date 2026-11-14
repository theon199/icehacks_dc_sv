import { StyleSheet, View } from 'react-native';

import {
  GlassIconButton,
  HEADER_CONTROL_SIZE,
  HEADER_TOP_OFFSET,
  PressableScale,
  Text,
  radii,
  space,
  useTheme,
} from '@/ui';

export interface OnboardingHeaderProps {
  /** 0-based position. */
  step: number;
  total: number;
  /** Null on the first question: there is nothing to go back to. */
  onBack: (() => void) | null;
  /** Null when the question cannot be skipped. */
  onSkip: (() => void) | null;
}

/**
 * The questionnaire's top row: the glass back circle, one dash per question (done ones in ink),
 * and Skip on the questions that allow it. Announces "Step 3 of 10".
 */
export function OnboardingHeader({ step, total, onBack, onSkip }: OnboardingHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {onBack ? (
        <GlassIconButton
          testID="onboarding-back"
          icon="chevron.left"
          accessibilityLabel="Previous question"
          onPress={onBack}
        />
      ) : (
        <View style={styles.spacer} />
      )}
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${step + 1} of ${total}`}
        accessibilityValue={{ min: 1, max: total, now: step + 1 }}
        style={styles.dashes}
      >
        {Array.from({ length: total }, (_unused, index) => (
          <View
            key={index}
            style={[
              styles.dash,
              { backgroundColor: index <= step ? theme.colors.primary : theme.colors.border },
            ]}
          />
        ))}
      </View>
      <View style={styles.end}>
        {onSkip ? (
          <PressableScale
            testID="onboarding-skip"
            accessibilityRole="button"
            accessibilityLabel="Skip"
            hitSlop={12}
            pressedOpacity={0.6}
            pressedScale={1}
            onPress={onSkip}
            style={styles.skip}
          >
            <Text variant="label" tone="muted" accessible={false}>
              Skip
            </Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: HEADER_TOP_OFFSET,
    paddingHorizontal: space.xl,
  },
  spacer: { width: HEADER_CONTROL_SIZE, height: HEADER_CONTROL_SIZE },
  dashes: { flex: 1, flexDirection: 'row', gap: 5 },
  dash: { flex: 1, height: 4, borderRadius: radii.pill },
  end: { minWidth: HEADER_CONTROL_SIZE, alignItems: 'flex-end' },
  skip: { minHeight: HEADER_CONTROL_SIZE, justifyContent: 'center' },
});
