import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMinutes } from '@/lib/format';
import { Icon, PressableScale, Text, radii, space, useTheme } from '@/ui';

import { Tag, type TagTone } from './Tag';
import type { MyRecipeCheck } from '../hooks/useMyRecipeChecks';
import { missingText, recipeMeta } from '../logic/meta';
import { issueText } from '../logic/safetyText';

export interface MyRecipeRowProps {
  check: MyRecipeCheck;
  onPress: (id: string) => void;
}

function statusOf(check: MyRecipeCheck): { label: string; tone: TagTone } {
  const { safety, coverage } = check;
  if (safety.status === 'conflict') {
    const first = safety.ingredients.find((line) => line.verdict === 'conflict')?.issues[0];
    return { label: first ? issueText(first) : 'Not for you', tone: 'danger' };
  }
  if (!check.cleared) {
    if (safety.unanswered) return { label: 'Answer allergies first', tone: 'accent' };
    if (safety.unverifiable > 0) {
      return { label: `${safety.unverifiable} can't be checked`, tone: 'accent' };
    }
    const count = safety.toConfirm;
    return {
      label: count > 0 ? `${count} to confirm` : 'Checking',
      tone: 'accent',
    };
  }
  const missing = missingText(coverage.missing);
  if (missing) return { label: missing, tone: 'accent' };
  return {
    label: coverage.total > 0 ? `You have all ${coverage.total}` : 'Ready',
    tone: 'highlight',
  };
}

/** A saved recipe in the list: a card glyph, the title, meta and where it stands. */
export const MyRecipeRow = memo(function MyRecipeRow({ check, onPress }: MyRecipeRowProps) {
  const theme = useTheme();
  const { recipe } = check;
  const meta = recipeMeta(recipe, (minutes) => formatMinutes(minutes));
  const status = statusOf(check);
  return (
    <PressableScale
      onPress={() => onPress(recipe.id)}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}. ${meta}. ${status.label}`}
      accessibilityHint="Opens the recipe"
      pressedOpacity={0.7}
      style={styles.row}
      testID={`my-recipe-${recipe.id}`}
    >
      <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceSunken }]}>
        <Icon name="doc.text" size={22} color="textMuted" />
      </View>
      <View style={styles.text}>
        <Text variant="headline" numberOfLines={1}>
          {recipe.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
        <Tag
          label={status.label}
          tone={status.tone}
          {...(status.tone === 'highlight' ? { icon: 'checkmark' as const } : {})}
        />
      </View>
      <Icon name="chevron.right" size={16} color="textMuted" />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: space.xs },
});
