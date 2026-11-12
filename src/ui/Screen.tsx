import type { ReactElement, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './ThemeProvider';
import { gutter, space } from './tokens';

export interface ScreenProps {
  children: ReactNode;
  /** Scrollable content (default). Use `false` for screens that manage their own lists. */
  scroll?: boolean;
  /** Pad the top safe area; only needed when the screen has no native header. */
  safeTop?: boolean;
  /** Horizontal gutter on the content (default true). */
  padded?: boolean;
  /** Pinned below the content, above the home indicator: primary actions, composer bars. */
  footer?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  background?: 'background' | 'surface';
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Standard screen container: themed background, safe areas, keyboard avoidance and scrolling.
 * Scroll content insets adjust automatically under native headers and tab bars.
 */
export function Screen({
  children,
  scroll = true,
  safeTop = false,
  padded = true,
  footer,
  refreshControl,
  background = 'background',
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const paddingTop = safeTop ? insets.top : 0;
  const horizontal = padded ? gutter : 0;

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      {...(refreshControl ? { refreshControl } : {})}
      contentContainerStyle={[
        {
          paddingTop: paddingTop + space.lg,
          paddingHorizontal: horizontal,
          paddingBottom: footer ? space.lg : space.xxxl,
          gap: space.lg,
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[styles.flex, { paddingTop, paddingHorizontal: horizontal }, contentContainerStyle]}
    >
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      testID={testID}
      style={[styles.flex, { backgroundColor: theme.colors[background] }]}
      behavior={Platform.OS === 'ios' && footer ? 'padding' : undefined}
    >
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: gutter,
              paddingBottom: Math.max(insets.bottom, space.lg),
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors[background],
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
