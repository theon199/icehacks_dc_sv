import { StyleSheet, View } from 'react-native';

import { Card, Text, radii, space, useTheme } from '@/ui';

export interface RecipeStepsProps {
  steps: readonly string[];
}

/** Numbered steps. */
export function RecipeSteps({ steps }: RecipeStepsProps) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="sectionLabel" accessibilityRole="header" style={styles.heading}>
        Steps
      </Text>
      <Card padding="lg" style={styles.card}>
        {steps.map((step, index) => (
          <View
            key={`${index}:${step.slice(0, 24)}`}
            style={styles.step}
            accessible
            accessibilityLabel={`Step ${index + 1}. ${step}`}
          >
            <View style={[styles.number, { backgroundColor: theme.colors.surfaceSunken }]}>
              <Text variant="label">{index + 1}</Text>
            </View>
            <Text variant="callout" style={styles.flex}>
              {step}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  heading: { paddingHorizontal: space.xxs },
  card: { gap: space.lg },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  number: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
