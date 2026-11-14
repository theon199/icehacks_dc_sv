import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeStep } from '@/lib/catalog';
import { Text, fontFamily, space, useTheme } from '@/ui';

export interface CookAllStepsProps {
  steps: readonly RecipeStep[];
  /** The step on screen. */
  current: number;
}

type StepState = 'done' | 'current' | 'upcoming';

const STATE_WORDS: Readonly<Record<StepState, string>> = {
  done: 'done',
  current: 'current step',
  upcoming: 'to come',
};

const NUMBER = 26;

/**
 * Every step at a glance under the current one: done steps struck through, the current one marked
 * with an ink number, the rest still to come. It is how the cook sees how far along they are.
 */
export const CookAllSteps = memo(function CookAllSteps({ steps, current }: CookAllStepsProps) {
  const theme = useTheme();
  return (
    <View style={styles.block} testID="cook-all-steps">
      <Text variant="headline" accessibilityRole="header" style={styles.heading}>
        All steps
      </Text>
      <View
        style={[
          styles.list,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.hairline,
            borderRadius: theme.radii.tile,
            ...theme.elevation.medium,
            shadowColor: theme.colors.shadow,
          },
        ]}
      >
        {steps.map((step, index) => {
          const state: StepState =
            index < current ? 'done' : index === current ? 'current' : 'upcoming';
          const numberBackground =
            state === 'done'
              ? theme.colors.highlightSoft
              : state === 'current'
                ? theme.colors.primary
                : theme.colors.surfaceSunken;
          const numberColor =
            state === 'done' ? 'onHighlightSoft' : state === 'current' ? 'onPrimary' : 'textMuted';
          return (
            <View
              key={`${step.position}:${index}`}
              accessible
              accessibilityLabel={`Step ${index + 1}, ${STATE_WORDS[state]}. ${step.text}`}
              style={[
                styles.row,
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.colors.border,
                },
              ]}
              testID={`cook-all-steps-row-${index + 1}`}
            >
              <View style={[styles.number, { backgroundColor: numberBackground }]}>
                <Text variant="caption" color={numberColor} style={styles.numberText}>
                  {index + 1}
                </Text>
              </View>
              <Text
                variant="subhead"
                numberOfLines={3}
                color={
                  state === 'upcoming' ? 'textMuted' : state === 'done' ? 'textSubtle' : 'text'
                }
                style={[
                  styles.rowText,
                  state === 'done' && {
                    textDecorationLine: 'line-through',
                    textDecorationColor: theme.colors.borderStrong,
                  },
                  state === 'current' && styles.rowTextCurrent,
                ]}
              >
                {step.text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  block: { gap: space.sm },
  heading: { paddingHorizontal: space.xs },
  list: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: space.md, padding: space.md },
  number: {
    width: NUMBER,
    height: NUMBER,
    borderRadius: NUMBER / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontVariant: ['tabular-nums'] },
  rowText: { flex: 1, minWidth: 0 },
  rowTextCurrent: { fontFamily: fontFamily.textSemiBold },
});
