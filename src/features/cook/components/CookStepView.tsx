import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { RecipeStep } from '@/lib/catalog';
import { Text, useTheme } from '@/ui';

export interface CookStepViewProps {
  step: RecipeStep;
  index: number;
  /** Changes whenever the step should be shown again from the top ("repeat"). */
  replayKey: number;
  /** Timer card and video, shown with the step. */
  children?: React.ReactNode;
  header?: React.ReactNode;
}

/**
 * One instruction in large type. Fades in on each new step (instantly with Reduce Motion).
 * Not memoised: its header and children are fresh elements on every parent render.
 */
export function CookStepView({ step, index, replayKey, children, header }: CookStepViewProps) {
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
        <View style={styles.body} testID="cook-step">
          <Text variant="overline" tone="accent">
            Step {index + 1}
          </Text>
          <Text variant="body" style={styles.instruction}>
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
  content: { gap: 20, paddingVertical: 20 },
  body: { gap: 10 },
  // Readable at arm's length from the stove.
  instruction: { fontSize: 26, lineHeight: 36 },
});
