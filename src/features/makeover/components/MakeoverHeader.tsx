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

export interface MakeoverHeaderProps {
  onClose: () => void;
}

/**
 * The makeover sheet's header row: a glass close circle and the feature's name beside it. It owns
 * the top safe-area inset, so it is drawn above the content with no safe area around it.
 */
export function MakeoverHeader({ onClose }: MakeoverHeaderProps) {
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
        icon="xmark"
        accessibilityLabel="Close Make it healthier"
        onPress={onClose}
        testID="makeover-close"
      />
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        style={styles.title}
      >
        Make it healthier
      </Text>
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
  title: { flex: 1, marginLeft: space.xs },
});
