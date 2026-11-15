import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, fontFamily, palettes, space } from '@/ui';

export interface CookButtonProps {
  /** The dish, for the spoken label. */
  title: string;
  onPress: () => void;
  testID?: string;
}

const HEIGHT = 56;
const DISC = 40;

// A photo looks the same in light and dark appearance, so the capsule laid on it is pinned to the
// light palette's ink and lime rather than following the theme.
const ink = palettes.light.primary;
const paper = palettes.light.onPrimary;
const lime = palettes.light.highlight;

/** The page's main action, laid on the photo: an ink "Cook it" capsule with a lime arrow disc. */
export const CookButton = memo(function CookButton({ title, onPress, testID }: CookButtonProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Cook ${title}`}
      accessibilityHint="Starts the step-by-step cooking guide"
      onPress={onPress}
      style={styles.button}
    >
      <Text variant="headline" style={styles.label} accessible={false}>
        Cook it
      </Text>
      <View style={[styles.disc, { backgroundColor: lime }]}>
        <Icon name="arrow.right" android="arrow_forward" size={18} color="onHighlight" />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  button: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.xl,
    paddingRight: space.sm,
    borderRadius: HEIGHT / 2,
    backgroundColor: ink,
    shadowColor: ink,
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  label: { color: paper, fontFamily: fontFamily.textBold },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
