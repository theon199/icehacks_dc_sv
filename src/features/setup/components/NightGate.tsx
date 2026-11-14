import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NightTheme, night } from '@/features/auth';
import { Text, fontFamily, space } from '@/ui';
import { Wordmark } from '@/ui/brand';

/**
 * The night page the age gate sits on: pure black, the wordmark top left, the content centred.
 * The welcome flow's one dark look carries on until the age question is answered.
 */
export function NightGate({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <NightTheme>
      <GateBody {...(testID ? { testID } : {})}>{children}</GateBody>
    </NightTheme>
  );
}

function GateBody({ children, testID }: { children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...(testID ? { testID } : {})}
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: night.black },
      ]}
    >
      <View style={styles.brand}>
        <Wordmark size={28} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(320)} style={styles.block}>
          {children}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

/** The gate's question: a white title and a muted line under it. */
export function GateHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.heading}>
      <Text variant="title1" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="subhead" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  brand: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.section,
  },
  block: { gap: space.xl },
  heading: { gap: space.xs },
  title: { color: night.ink, fontFamily: fontFamily.display, letterSpacing: -0.6 },
  subtitle: { color: night.inkMuted },
});
