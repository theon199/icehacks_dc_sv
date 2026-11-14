import { useEffect, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { RecipeStep } from '@/lib/catalog';
import { Text, gutter, space, useTheme } from '@/ui';

import { CookAllSteps } from './CookAllSteps';

export interface CookStepViewProps {
  steps: readonly RecipeStep[];
  index: number;
  /** Changes whenever the step should be shown again from the top ("repeat"). */
  replayKey: number;
  /** Room left under the last block for the floating Ingredients pill. */
  bottomInset: number;
  /** Timer and notices, inside the step card under the instruction. */
  children?: ReactNode;
  /** The back / timer / next row closing the step card. */
  controls: ReactNode;
  /** The tutorial video, above the step card. */
  header?: ReactNode;
}

/**
 * The current step on a white card (its number, the instruction, the step's timer and the
 * controls), then every step at a glance. The card fades in on each new step, at once with Reduce
 * Motion. Not memoised: its header, children and controls are fresh elements on every render.
 */
export function CookStepView({
  steps,
  index,
  replayKey,
  bottomInset,
  children,
  controls,
  header,
}: CookStepViewProps) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);
  const step = steps[index];

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [index, replayKey]);

  if (!step) return null;

  return (
    <ScrollView
      ref={scroll}
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      <Animated.View
        key={`${index}:${replayKey}`}
        entering={FadeIn.duration(theme.motion.duration.base)}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.hairline,
              borderRadius: theme.radii.card,
              ...theme.elevation.medium,
              shadowColor: theme.colors.shadow,
            },
          ]}
          testID="cook-step"
        >
          <Text variant="overline" tone="muted">
            Step {index + 1} of {steps.length}
          </Text>
          <Text variant="headline">{step.text}</Text>
          {children}
          {controls}
        </View>
      </Animated.View>
      <CookAllSteps steps={steps} current={index} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: space.lg, paddingHorizontal: gutter, paddingTop: space.sm },
  card: { gap: space.sm, padding: space.xl, borderWidth: StyleSheet.hairlineWidth },
});
