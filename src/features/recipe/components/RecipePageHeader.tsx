import { GlassContainer } from 'expo-glass-effect';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import {
  GlassIconButton,
  GlassMenu,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  hasLiquidGlass,
  Text,
  gutter,
  space,
  useGlassMenu,
  type GlassMenuItem,
} from '@/ui';

export interface RecipePageHeaderProps {
  title: string;
  onBack: () => void;
  /** The page's secondary actions, dropped from the glass "more" circle. Omit for none. */
  menu?: readonly GlassMenuItem[];
}

/**
 * The recipe page's header row: the glass back circle, the dish name centred between two equal
 * sides, and a glass "more" circle that opens the page's menu. It owns the top safe-area inset.
 */
export const RecipePageHeader = memo(function RecipePageHeader({
  title,
  onBack,
  menu,
}: RecipePageHeaderProps) {
  const insets = useSafeAreaInsets();
  const controller = useGlassMenu();
  const { show } = controller;
  const open = useCallback(() => {
    haptics.selection();
    show();
  }, [show]);

  const more =
    menu && menu.length > 0 ? (
      <View ref={controller.triggerRef} collapsable={false}>
        <GlassIconButton
          icon="ellipsis"
          accessibilityLabel={`More options for ${title}`}
          onPress={open}
          testID="recipe-more"
        />
      </View>
    ) : null;

  return (
    <View
      style={[styles.header, { paddingTop: insets.top + HEADER_TOP_OFFSET }]}
      testID="recipe-header"
    >
      <View style={styles.side}>
        <GlassIconButton
          icon="chevron.left"
          accessibilityLabel="Back"
          onPress={onBack}
          testID="recipe-back"
        />
      </View>
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        align="center"
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        style={styles.title}
        testID="recipe-header-title"
      >
        {title}
      </Text>
      {hasLiquidGlass() ? (
        <GlassContainer spacing={0} style={[styles.side, styles.trailing]}>
          {more}
        </GlassContainer>
      ) : (
        <View style={[styles.side, styles.trailing]}>{more}</View>
      )}
      {menu && menu.length > 0 ? (
        <GlassMenu
          controller={controller}
          items={menu}
          dismissLabel="Close recipe options"
          testID="recipe-menu"
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: gutter,
    paddingBottom: space.sm,
  },
  side: { width: HEADER_CONTROL_SIZE, height: HEADER_CONTROL_SIZE, flexDirection: 'row' },
  trailing: { justifyContent: 'flex-end' },
  title: { flex: 1 },
});
