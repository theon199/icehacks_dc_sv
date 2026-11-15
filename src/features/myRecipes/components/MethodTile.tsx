import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, radii, space, useTheme, type IconName } from '@/ui';

export interface MethodTileProps {
  icon: IconName;
  title: string;
  caption: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

/** One way to bring a recipe in, as a tile in the 2x2 grid. */
export function MethodTile({ icon, title, caption, onPress, disabled, testID }: MethodTileProps) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${caption}`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      pressedScale={0.97}
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.surface,
          opacity: disabled ? 0.5 : 1,
          ...theme.elevation.low,
          shadowColor: theme.colors.shadow,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      <View style={[styles.disc, { backgroundColor: theme.colors.highlight }]}>
        <Icon name={icon} size={20} color="onHighlight" />
      </View>
      <Text variant="headline">{title}</Text>
      <Text variant="footnote" tone="muted">
        {caption}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 136,
    padding: space.lg,
    gap: space.sm,
    borderRadius: radii.tile,
  },
  disc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
});
