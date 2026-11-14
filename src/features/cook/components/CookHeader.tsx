import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  TAB_HEADER_GUTTER,
  Text,
  space,
} from '@/ui';

export interface CookHeaderProps {
  title: string;
  onBack: () => void;
  backLabel: string;
  /** Round glass controls on the right. */
  actions?: ReactNode;
}

/**
 * The cook screen's header row: a glass back circle, the dish name right beside it on one line,
 * and the cook tools as glass circles on the right. It owns the top safe-area inset, so it is the
 * first child of a full-height view with no top safe area around it.
 */
export function CookHeader({ title, onBack, backLabel, actions }: CookHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + HEADER_TOP_OFFSET }]}>
      <GlassIconButton
        icon="chevron.left"
        accessibilityLabel={backLabel}
        onPress={onBack}
        testID="cook-close"
      />
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        style={styles.title}
      >
        {title}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: HEADER_CONTROL_SIZE,
  },
});
