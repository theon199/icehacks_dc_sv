import { StyleSheet, View } from 'react-native';

import {
  GlassIconButton,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  Text,
  space,
} from '@/ui';

export interface FridgeMealsHeaderProps {
  onBack: () => void;
  onPantry: () => void;
}

/** The glass back circle, the page name, and a glass circle that opens the pantry. */
export function FridgeMealsHeader({ onBack, onPantry }: FridgeMealsHeaderProps) {
  return (
    <View style={styles.row}>
      <GlassIconButton
        icon="chevron.left"
        accessibilityLabel="Back"
        onPress={onBack}
        testID="fridge-meals-back"
      />
      <Text
        variant="title2"
        accessibilityRole="header"
        numberOfLines={1}
        align="center"
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        style={styles.title}
      >
        From your fridge
      </Text>
      <GlassIconButton
        icon="refrigerator"
        accessibilityLabel="Your pantry"
        accessibilityHint="Opens what you have at home"
        onPress={onPantry}
        testID="fridge-meals-pantry"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HEADER_CONTROL_SIZE,
  },
  title: { flex: 1 },
});
