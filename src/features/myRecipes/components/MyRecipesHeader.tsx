import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  TAB_HEADER_GUTTER,
  Text,
  space,
  useTheme,
} from '@/ui';

export interface MyRecipesHeaderProps {
  title: string;
  onBack: () => void;
  backLabel?: string;
  /** A glass action on the right, e.g. the edit pencil. */
  trailing?: ReactNode;
}

/**
 * The header row of the My recipes screens: a glass back circle, the title and an optional action.
 * It owns the top safe-area inset.
 */
export function MyRecipesHeader({
  title,
  onBack,
  backLabel = 'Back',
  trailing,
}: MyRecipesHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + HEADER_TOP_OFFSET, backgroundColor: theme.colors.background },
      ]}
    >
      <GlassIconButton
        icon="chevron.left"
        accessibilityLabel={backLabel}
        onPress={onBack}
        testID="my-recipes-back"
      />
      <Text
        variant="title2"
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        style={styles.title}
      >
        {title}
      </Text>
      {trailing ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: TAB_HEADER_GUTTER,
    paddingBottom: space.sm,
  },
  title: { flex: 1, textAlign: 'center' },
  spacer: { width: 44 },
});
