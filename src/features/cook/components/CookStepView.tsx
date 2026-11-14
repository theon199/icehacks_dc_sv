import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { RecipeStep } from '@/lib/catalog';
import { Text, space, useTheme } from '@/ui';

export interface CookStepViewProps {
  step: RecipeStep;
  index: number;
  /** Steps in the recipe, for "Step 2 of 5". */
  count: number;
  /** Changes whenever the step should be shown again from the top ("repeat"). */
  replayKey: number;
  /** Timer card and video, shown with the step. */
  children?: React.ReactNode;
  header?: React.ReactNode;
}

/**
 * One instruction in large type on a white card. Fades in on each new step (instantly with Reduce Motion).
 * Not memoised: its header and children are fresh elements on every parent render.
 */
export function CookStepView({
  step,
  index,
  count,
  replayKey,
  children,
  header,
}: CookStepViewProps) {
  const theme = useTheme();
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [index, replayKey]);

  return (
    <ScrollView
      ref={scroll}
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
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
              borderRadius: theme.radii.xl,
              ...theme.elevation.medium,
              shadowColor: theme.colors.shadow,
            },
          ]}
          testID="cook-step"
        >
          <Text variant="overline" tone="muted">
            Step {index + 1} of {count}
          </Text>
          <Text variant="title2" style={styles.instruction}>
            {step.text}
          </Text>
        </View>
      </Animated.View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: space.lg, paddingVertical: space.lg },
  card: { gap: space.md, padding: space.xxl },
  // Readable at arm's length from the stove.
  instruction: { fontSize: 25, lineHeight: 35 },
});
