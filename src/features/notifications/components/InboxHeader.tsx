import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  HEADER_CONTROL_SIZE,
  HEADER_TITLE_MAX_FONT_SCALE,
  HEADER_TOP_OFFSET,
  Text,
  gutter,
  space,
} from '@/ui';

export interface InboxHeaderProps {
  title: string;
  /** One glass control on the trailing side. */
  action?: ReactNode;
}

/**
 * The pushed-screen header: the glass back circle, the title centred against the screen on one
 * line, and an optional control opposite. Both sides reserve one control's width so the title
 * never shifts when the action comes and goes. It owns the top safe area, so render it first,
 * outside the list.
 */
export function InboxHeader({ title, action }: InboxHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <View style={[styles.header, { paddingTop: insets.top + HEADER_TOP_OFFSET }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.side}>
        <GlassIconButton icon="chevron.left" accessibilityLabel="Back" onPress={back} />
      </View>
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={HEADER_TITLE_MAX_FONT_SCALE}
        style={styles.title}
      >
        {title}
      </Text>
      <View style={[styles.side, styles.end]}>{action}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: gutter,
    paddingBottom: space.sm,
  },
  side: { width: HEADER_CONTROL_SIZE, height: HEADER_CONTROL_SIZE, flexDirection: 'row' },
  end: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
});
