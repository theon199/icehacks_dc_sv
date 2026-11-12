import { StyleSheet, View } from 'react-native';

import { ALLERGEN_LABELS, type AllergenId } from '@/domain/types/allergens';
import type { MakeoverResponse } from '@/lib/api/ai';
import { Card, Icon, Text, space } from '@/ui';

import type { AllergenHit } from '../logic/allergenCheck';

export interface MakeoverResultProps {
  originalTitle: string;
  makeover: MakeoverResponse;
  hits: readonly AllergenHit[];
  /** Allergens the answer was checked against. */
  checked: readonly AllergenId[];
}

function AllergenCheck({ hits, checked }: Pick<MakeoverResultProps, 'hits' | 'checked'>) {
  if (hits.length > 0) {
    return (
      <Card variant="sunken" testID="makeover-allergen-warning" style={styles.check}>
        <View style={styles.row}>
          <Icon name="exclamationmark.triangle.fill" size={20} color="danger" />
          <Text variant="headline" tone="danger" style={styles.flex}>
            This version still mentions something you avoid
          </Text>
        </View>
        {hits.map((hit, index) => (
          <Text key={`${hit.where}-${index}`} variant="callout" tone="muted">
            {`${hit.where}: "${hit.found}" (${ALLERGEN_LABELS[hit.allergen].toLowerCase()})`}
          </Text>
        ))}
        <Text variant="footnote" tone="muted">
          {"It can't be saved. Try again for a different version."}
        </Text>
      </Card>
    );
  }
  const names = checked.map((id) => ALLERGEN_LABELS[id].toLowerCase());
  return (
    <View style={styles.row} testID="makeover-allergen-ok">
      <Icon name="checkmark.shield" size={18} color="success" />
      <Text variant="footnote" tone="muted" style={styles.flex}>
        {names.length > 0
          ? `Checked on your phone for ${names.join(', ')}. AI-adapted recipes can't be verified like catalog recipes, so read your labels.`
          : 'AI-adapted recipes are not verified like catalog recipes. Read your labels.'}
      </Text>
    </View>
  );
}

/** Step two: the healthier version, what changed and why. */
export function MakeoverResult({ originalTitle, makeover, hits, checked }: MakeoverResultProps) {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text variant="overline" tone="accent">
          {`Healthier take on ${originalTitle}`}
        </Text>
        <Text variant="title2">{makeover.title}</Text>
        {makeover.note ? (
          <Text variant="callout" tone="muted">
            {makeover.note}
          </Text>
        ) : null}
      </View>

      <AllergenCheck hits={hits} checked={checked} />

      {makeover.swaps.length > 0 ? (
        <View style={styles.section}>
          <Text variant="headline">What changed</Text>
          {makeover.swaps.map((swap, index) => (
            <Card key={index} variant="outlined" padding="md" style={styles.swap}>
              <View
                style={styles.swapLine}
                accessible
                accessibilityLabel={`${swap.from} becomes ${swap.to}`}
              >
                <Text
                  variant="callout"
                  tone="subtle"
                  style={styles.removed}
                  accessible={false}
                  numberOfLines={2}
                >
                  {swap.from}
                </Text>
                <Icon name="arrow.right" size={16} color="textSubtle" />
                <Text variant="bodyStrong" tone="primary" style={styles.flex} accessible={false}>
                  {swap.to}
                </Text>
              </View>
              {swap.why ? (
                <Text variant="footnote" tone="muted">
                  {swap.why}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="headline">{`Ingredients · serves ${makeover.servings}`}</Text>
        {makeover.ingredients.map((line, index) => (
          <View key={index} style={styles.row}>
            <Text variant="body" tone="muted" accessible={false}>
              {'•'}
            </Text>
            <Text variant="body" style={styles.flex}>
              {line}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text variant="headline">Steps</Text>
        {makeover.steps.map((step, index) => (
          <View key={index} style={styles.row}>
            <Text variant="bodyStrong" tone="primary" style={styles.stepNumber}>
              {index + 1}
            </Text>
            <Text variant="body" style={styles.flex}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xl },
  section: { gap: space.sm },
  check: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  swap: { gap: space.xs },
  swapLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  removed: { flexShrink: 1, maxWidth: '45%', textDecorationLine: 'line-through' },
  stepNumber: { minWidth: 20 },
  flex: { flex: 1 },
});
