import { router, Stack, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  GlassSurface,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  Text,
  fontFamily,
  space,
} from '@/ui';

/** Space a scroll under the bar leaves above its first content: the bar plus a small gap. */
export const TOP_BAR_CLEARANCE = HEADER_TOP_OFFSET + HEADER_CONTROL_SIZE + space.sm;

export interface ProfileTopBarProps {
  title: string;
  /** Glass controls on the trailing edge. */
  trailing?: ReactNode;
  /** Where Back goes when the screen was opened without history, e.g. from a link. */
  fallbackHref: Href;
}

/**
 * The header row of the profile screens: the glass back circle, the screen name on a glass plate,
 * and optional controls at the trailing edge. It floats over the scroll (the native bar is
 * hidden), so it stays put while the content passes beneath it. The plate gives the name the same
 * backing as its neighbours, so it stays legible over a dark card scrolling under it.
 *
 * It is positioned from the frame's top edge, which the caller pads by the safe-area inset.
 */
export function ProfileTopBar({ title, trailing, fallbackHref }: ProfileTopBarProps) {
  const insets = useSafeAreaInsets();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackHref);
  };
  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { top: insets.top + HEADER_TOP_OFFSET }]}
      testID="profile-top-bar"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <GlassIconButton icon="chevron.left" accessibilityLabel="Back" onPress={back} />
      <GlassSurface radius="pill" style={styles.plate}>
        {/* A label only: a drag that starts on it still scrolls the content behind. */}
        <View pointerEvents="none">
          <Text
            variant="title2"
            accessibilityRole="header"
            numberOfLines={1}
            maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
            style={styles.title}
          >
            {title}
          </Text>
        </View>
      </GlassSurface>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HEADER_CONTROL_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    zIndex: 1,
  },
  plate: {
    flexShrink: 1,
    height: HEADER_CONTROL_SIZE,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  title: { fontFamily: fontFamily.textBold, letterSpacing: -0.4 },
  trailing: { marginLeft: 'auto' },
});
