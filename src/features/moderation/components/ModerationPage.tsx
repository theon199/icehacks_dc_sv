import { Stack, useRouter, type Href } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  Screen,
  Text,
  fontFamily,
  space,
  useTheme,
} from '@/ui';

export interface ModerationPageProps {
  title: string;
  /**
   * A short label over a large title, for the review and notice pages. Without it the title sits
   * beside the back circle on one row.
   */
  eyebrow?: string;
  /** `false` for pages that lay out their own list under the heading. */
  scroll?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Where Back goes when the page was opened without history, e.g. from a notification. */
  fallbackHref?: Href;
  testID?: string;
  children: ReactNode;
}

/** The back circle and the page's name: beside it on one row, or under it as a large title. */
export function ModerationHeading({
  title,
  eyebrow,
  fallbackHref = '/settings',
}: Pick<ModerationPageProps, 'title' | 'eyebrow' | 'fallbackHref'>) {
  const router = useRouter();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };
  const backButton = (
    <GlassIconButton icon="chevron.left" accessibilityLabel="Back" onPress={back} />
  );

  if (!eyebrow) {
    return (
      <View style={styles.row}>
        {backButton}
        <Text
          variant="title2"
          accessibilityRole="header"
          numberOfLines={2}
          maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
          style={styles.rowTitle}
        >
          {title}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.editorial}>
      <View style={styles.backRow}>{backButton}</View>
      <View style={styles.heading}>
        <Text variant="overline" style={styles.eyebrow}>
          {eyebrow}
        </Text>
        <Text variant="display" accessibilityRole="header" style={styles.display}>
          {title}
        </Text>
      </View>
    </View>
  );
}

/**
 * The frame of the moderation and safety pages. The native bar is hidden and the back circle
 * leads the content instead, as on every other pushed page; the top safe area pads the frame so
 * nothing scrolls under the status bar.
 */
export function ModerationPage({
  title,
  eyebrow,
  scroll = true,
  refreshControl,
  fallbackHref,
  testID,
  children,
}: ModerationPageProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const heading = (
    <ModerationHeading
      title={title}
      {...(eyebrow === undefined ? {} : { eyebrow })}
      {...(fallbackHref === undefined ? {} : { fallbackHref })}
    />
  );

  return (
    <View
      style={[styles.frame, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}
      {...(testID === undefined ? {} : { testID })}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {scroll ? (
        <Screen
          contentContainerStyle={[styles.content, eyebrow ? styles.contentEditorial : null]}
          {...(refreshControl === undefined ? {} : { refreshControl })}
        >
          {heading}
          {children}
        </Screen>
      ) : (
        <>
          <View style={[styles.fixedHeading, eyebrow ? styles.fixedEditorial : null]}>
            {heading}
          </View>
          <View style={styles.frame}>{children}</View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { paddingTop: HEADER_TOP_OFFSET, paddingBottom: space.xl, gap: space.md },
  contentEditorial: { paddingHorizontal: space.xl, paddingBottom: 56, gap: space.xl },
  fixedHeading: { paddingTop: HEADER_TOP_OFFSET, paddingHorizontal: space.lg },
  fixedEditorial: { paddingHorizontal: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowTitle: { flex: 1, fontFamily: fontFamily.textBold },
  editorial: { gap: space.sm },
  backRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  heading: { gap: space.sm, marginTop: space.sm, marginBottom: space.md },
  eyebrow: { letterSpacing: 1.5 },
  display: { fontFamily: fontFamily.displayBold, lineHeight: 41, letterSpacing: -1 },
});
