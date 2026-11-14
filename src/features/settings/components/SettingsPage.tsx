import { Stack, useRouter, type Href } from 'expo-router';
import { useCallback, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GlassSurface,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  Screen,
  Text,
  fontFamily,
  space,
  useTheme,
} from '@/ui';

export interface SettingsPageProps {
  /** The page's short name, on the same row as the back circle. */
  title: string;
  /** A headline under that row, for pages whose headline differs from their name. */
  heading?: string;
  /** Where Back goes when the page was opened without history, e.g. from a link. */
  fallbackHref?: Href;
  /** Pinned below the content: the page's primary action. */
  footer?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  /**
   * Pin the back circle and a glass title pill over the content, for long editors whose way back
   * must stay in reach while the cards scroll under it.
   */
  pinned?: boolean;
  testID?: string;
  children: ReactNode;
}

/**
 * The frame every settings page shares: the glass back circle with the page name beside it at the
 * top of the scroll, then the page's cards. The native navigation bar is hidden so this row sits
 * where every other header control in the app sits.
 *
 * The top safe area pads the frame rather than the scroll content, so nothing scrolls under the
 * status bar.
 */
export function SettingsPage({
  title,
  heading,
  fallbackHref = '/settings',
  footer,
  refreshControl,
  pinned = false,
  testID,
  children,
}: SettingsPageProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  }, [router, fallbackHref]);

  const backButton = (
    <GlassIconButton
      icon="chevron.left"
      accessibilityLabel="Back"
      onPress={back}
      testID="page-back"
    />
  );

  return (
    <View
      style={[styles.frame, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Screen
        contentContainerStyle={[styles.content, pinned && styles.pinnedContent]}
        {...(footer === undefined ? {} : { footer })}
        {...(refreshControl === undefined ? {} : { refreshControl })}
        {...(testID === undefined ? {} : { testID })}
      >
        {pinned ? null : (
          <View style={styles.header}>
            <View style={styles.row}>
              {backButton}
              <Text
                variant="title2"
                accessibilityRole="header"
                numberOfLines={2}
                maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
                style={styles.title}
              >
                {title}
              </Text>
            </View>
            {heading ? (
              <Text variant="title1" accessibilityRole="header">
                {heading}
              </Text>
            ) : null}
          </View>
        )}
        {children}
      </Screen>
      {pinned ? (
        <View pointerEvents="box-none" style={[styles.pinnedBar, { top: insets.top }]}>
          {backButton}
          {/* A label only: a drag that starts on it still scrolls the cards beneath. */}
          <GlassSurface radius="pill" style={styles.pill}>
            <View pointerEvents="none">
              <Text
                variant="headline"
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
                style={styles.pillTitle}
              >
                {title}
              </Text>
            </View>
          </GlassSurface>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { paddingTop: HEADER_TOP_OFFSET, paddingBottom: space.xl, gap: space.md },
  pinnedContent: {
    paddingTop: HEADER_CONTROL_SIZE + space.xl,
    paddingHorizontal: space.xl,
    gap: space.xl,
  },
  header: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { flex: 1, fontFamily: fontFamily.textBold },
  pinnedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  pill: { height: 38, justifyContent: 'center', paddingHorizontal: space.lg, flexShrink: 1 },
  pillTitle: { fontFamily: fontFamily.textBold, letterSpacing: -0.3 },
});
