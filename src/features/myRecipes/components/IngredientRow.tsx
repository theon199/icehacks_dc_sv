import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { IngredientCheck, LineStock } from '@/domain/ownRecipes';
import { Button, Icon, Text, radii, space, useTheme, type Palette } from '@/ui';

import { Tag } from './Tag';
import { lineNote } from '../logic/safetyText';

export interface IngredientRowProps {
  text: string;
  /** What the pantry says about this line. */
  stock: LineStock;
  /** Null while the line is still being matched to the catalog. */
  check: IngredientCheck | null;
  /** Offered for lines that need a check; never for conflicts. */
  onConfirm?: () => void;
  onUndo?: () => void;
  divider?: boolean;
  testID?: string;
}

const STOCK_LABEL: Readonly<Record<LineStock, string>> = {
  have: 'In your kitchen',
  need: 'Not in your pantry',
  staple: 'Pantry staple',
};

const NOTE_COLOR: Readonly<Record<IngredientCheck['verdict'], keyof Palette>> = {
  clear: 'textMuted',
  confirmed: 'textMuted',
  needs_check: 'onWarningSoft',
  conflict: 'danger',
};

/** One ingredient line: whether it is at home, and its safety note and check action. */
export const IngredientRow = memo(function IngredientRow({
  text,
  stock,
  check,
  onConfirm,
  onUndo,
  divider = false,
  testID,
}: IngredientRowProps) {
  const theme = useTheme();
  const note = check ? lineNote(check) : null;
  const have = stock !== 'need';
  return (
    <View
      style={[
        styles.row,
        divider && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
      ]}
      testID={testID}
    >
      <View
        style={styles.line}
        accessible
        accessibilityLabel={[text, STOCK_LABEL[stock], note].filter(Boolean).join('. ')}
      >
        <View
          style={[
            styles.box,
            have
              ? { backgroundColor: theme.colors.highlight }
              : { borderWidth: 1.5, borderColor: theme.colors.borderStrong },
          ]}
        >
          {have ? <Icon name="checkmark" size={13} color="onHighlight" weight="bold" /> : null}
        </View>
        <View style={styles.text}>
          <Text variant="callout">{text}</Text>
          {note ? (
            <Text variant="footnote" color={NOTE_COLOR[check?.verdict ?? 'clear']}>
              {note}
            </Text>
          ) : null}
        </View>
        {stock === 'need' ? <Tag label="Need" tone="accent" /> : null}
      </View>
      {check?.verdict === 'needs_check' && onConfirm ? (
        <Button
          label="I checked this"
          size="sm"
          variant="secondary"
          icon="checkmark"
          onPress={onConfirm}
          accessibilityHint={`Says you checked ${text} against your allergies and diet`}
          style={styles.action}
          {...(testID ? { testID: `${testID}-confirm` } : {})}
        />
      ) : null}
      {check?.verdict === 'confirmed' && onUndo ? (
        <Button
          label="Undo check"
          size="sm"
          variant="ghost"
          onPress={onUndo}
          accessibilityHint={`Puts ${text} back on the list to check`}
          style={styles.action}
          {...(testID ? { testID: `${testID}-undo` } : {})}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { paddingVertical: space.md, gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  box: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: space.xxs },
  action: { alignSelf: 'flex-start', marginLeft: 22 + space.md },
});
