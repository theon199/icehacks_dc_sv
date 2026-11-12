import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { GOAL_DETAILS } from '@/domain/types/goals';
import { formatNumber } from '@/lib/format';
import { Button, Card, radii, space, Text, useTheme } from '@/ui';

import type { HealthierVersion, Improvement } from '../logic/dishMatch';

export function improvementText(improvement: Improvement): string {
  const amount = formatNumber(improvement.amount, 0);
  switch (improvement.nutrient) {
    case 'kcal':
      return `About ${amount} fewer kcal`;
    case 'sodium_mg':
      return `About ${amount} mg less sodium`;
    case 'fat_g':
      return `About ${amount} g less fat`;
    case 'fiber_g':
      return `About ${amount} g more fiber`;
    case 'protein_g':
      return `About ${amount} g more protein`;
  }
}

export interface HealthierCardProps {
  version: HealthierVersion;
  onOpen: (id: string) => void;
}

/** The closest catalog recipe that clearly improves on the estimated plate. */
export function HealthierCard({ version, onOpen }: HealthierCardProps) {
  const theme = useTheme();
  const { recipe } = version;
  return (
    <Card testID="dish-healthier">
      <View style={styles.stack}>
        <Text variant="overline" tone="primary">
          Healthier version to cook
        </Text>
        <View style={styles.row}>
          {recipe.imageUrl ? (
            <Image
              source={{ uri: recipe.imageUrl }}
              style={[styles.image, { backgroundColor: theme.colors.surfaceSunken }]}
              contentFit="cover"
              accessible={false}
            />
          ) : null}
          <View style={styles.text}>
            <Text variant="headline">{recipe.title}</Text>
            <Text variant="footnote" tone="muted">
              Per serving, compared with the estimate for your plate
            </Text>
          </View>
        </View>
        <View style={styles.list}>
          {version.improvements.slice(0, 3).map((improvement) => (
            <Text key={improvement.nutrient} variant="callout">
              {`• ${improvementText(improvement)}`}
            </Text>
          ))}
          {version.goalsServed.length > 0 ? (
            <Text variant="callout" tone="success">
              {`• Fits your goals: ${version.goalsServed
                .map((goal) => GOAL_DETAILS[goal].label.toLowerCase())
                .join(', ')}`}
            </Text>
          ) : null}
        </View>
        <Button
          label="View recipe"
          variant="secondary"
          onPress={() => onOpen(recipe.id)}
          testID="dish-healthier-open"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  image: { width: 72, height: 72, borderRadius: radii.sm },
  text: { flex: 1, gap: space.xxs },
  list: { gap: space.xs },
});
