import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { space, Text, useTheme } from '@/ui';

import { SETUP_ART, SETUP_ART_ASPECT } from '../art';
import type { SetupStep } from '../logic/setupSteps';

export interface SetupStepViewProps {
  step: SetupStep;
  index: number;
  count: number;
}

/** One mounting step: the rendered cabinet scene, a progress row and the instruction. */
export function SetupStepView({ step, index, count }: SetupStepViewProps) {
  const theme = useTheme();
  return (
    <View style={styles.root} testID={`setup-step-${index + 1}`}>
      <View
        style={[
          styles.art,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.card,
            shadowColor: theme.colors.shadow,
            ...theme.elevation.medium,
          },
        ]}
      >
        <Image
          source={SETUP_ART[step.art]}
          style={styles.image}
          contentFit="contain"
          transition={theme.motion.duration.base}
          accessibilityLabel={`Illustration: ${step.title}`}
        />
      </View>
      <View
        style={styles.progress}
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${index + 1} of ${count}`}
      >
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                backgroundColor:
                  i < index
                    ? theme.colors.primary
                    : i === index
                      ? theme.colors.highlight
                      : theme.colors.border,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.copy}>
        <Text variant="caption" tone="muted" align="center">
          Step {index + 1} of {count}
        </Text>
        <Text variant="title1" align="center">
          {step.title}
        </Text>
        <Text variant="callout" tone="muted" align="center">
          {step.body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  art: { width: '100%', aspectRatio: SETUP_ART_ASPECT, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  progress: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.giant },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  copy: { gap: space.sm, paddingHorizontal: space.sm },
});
