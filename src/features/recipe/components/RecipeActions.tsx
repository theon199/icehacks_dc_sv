import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, PressableScale, Text, space, useTheme, type IconName } from '@/ui';

export interface RecipeActionsProps {
  saved: boolean;
  onToggleSave: () => void;
  onPlan: () => void;
  onShop: () => void;
  onMakeHealthier: () => void;
}

interface QuickAction {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  selected?: boolean;
  hint: string;
}

/** Save, plan and shop shortcuts, plus the "Make it healthier" call to action. */
export const RecipeActions = memo(function RecipeActions({
  saved,
  onToggleSave,
  onPlan,
  onShop,
  onMakeHealthier,
}: RecipeActionsProps) {
  const theme = useTheme();
  const actions: QuickAction[] = [
    {
      key: 'save',
      icon: saved ? 'bookmark.fill' : 'bookmark',
      label: saved ? 'Saved' : 'Save',
      onPress: onToggleSave,
      selected: saved,
      hint: saved ? 'Removes it from your cookbook' : 'Keeps it in your cookbook',
    },
    {
      key: 'plan',
      icon: 'calendar.badge.plus',
      label: 'Plan',
      onPress: onPlan,
      hint: 'Picks a day and meal for it',
    },
    {
      key: 'shop',
      icon: 'cart.badge.plus',
      label: 'Shop',
      onPress: onShop,
      hint: 'Adds its ingredients to your shopping list',
    },
  ];
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {actions.map((action) => (
          <PressableScale
            key={action.key}
            testID={`recipe-action-${action.key}`}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityHint={action.hint}
            {...(action.selected === undefined
              ? {}
              : { accessibilityState: { selected: action.selected } })}
            onPress={action.onPress}
            style={[
              styles.action,
              { backgroundColor: theme.colors.surface, borderRadius: theme.radii.md },
            ]}
          >
            <Icon name={action.icon} size={22} color={action.selected ? 'accent' : 'primary'} />
            <Text variant="caption" tone="muted">
              {action.label}
            </Text>
          </PressableScale>
        ))}
      </View>
      <Button
        label="Make it healthier"
        icon="sparkles"
        variant="secondary"
        onPress={onMakeHealthier}
        fullWidth
        accessibilityHint="Suggests swaps that suit your goals"
        testID="recipe-action-healthier"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 64,
    paddingVertical: space.sm,
  },
});
