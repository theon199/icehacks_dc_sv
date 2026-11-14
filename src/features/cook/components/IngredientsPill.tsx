import { StyleSheet, View } from 'react-native';

import { GlassControl, Icon, Text, space } from '@/ui';

export interface IngredientsPillProps {
  bottom: number;
  onPress: () => void;
}

const HEIGHT = 48;

/**
 * The glass "Ingredients" capsule floating over the bottom-left of cook mode. It opens the
 * checklist over the step, so the step, the video and any running timer stay where they are.
 */
export function IngredientsPill({ bottom, onPress }: IngredientsPillProps) {
  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom }]}>
      <GlassControl
        radius={HEIGHT / 2}
        onPress={onPress}
        accessibilityLabel="Ingredients"
        accessibilityHint="Opens the ingredient checklist"
        style={styles.pill}
        testID="cook-ingredients-open"
      >
        <Icon name="cart" size={17} color="text" />
        <Text variant="label" accessible={false}>
          Ingredients
        </Text>
      </GlassControl>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: space.md },
  pill: {
    minHeight: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xl,
  },
});
