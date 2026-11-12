import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/lib/haptics';
import { Button, PressableScale, Text, gutter, useTheme } from '@/ui';
import { Wordmark } from '@/ui/brand';

import { WelcomeArt, type WelcomeArtKind } from '../components/WelcomeArt';

interface Slide {
  art: WelcomeArtKind;
  title: string;
  body: string;
}

const slides: readonly Slide[] = [
  {
    art: 'bowl',
    title: 'The food you love, a little lighter',
    body: 'Famara finds better-for-you versions of the dishes you grew up with, from every corner of the world.',
  },
  {
    art: 'fit',
    title: 'Know why each recipe fits',
    body: 'Every suggestion shows its reasons: more fiber, less salt, safe for your allergies, ready in your time.',
  },
  {
    art: 'plan',
    title: 'Plan, cook and shop in one place',
    body: 'Build your week, cook step by step and turn the plan into a shopping list.',
  },
];

/** First screen for signed-out people: three slides and the way in. */
export function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const artSize = Math.min(width - gutter * 4, height * 0.34, 340);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== index) {
      haptics.selection();
      setIndex(next);
    }
  };

  const goTo = (next: number) => {
    setIndex(next);
    scroller.current?.scrollTo({ x: next * width, animated: !reduceMotion });
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + theme.space.md,
          paddingBottom: Math.max(insets.bottom, theme.space.lg),
        },
      ]}
    >
      <View style={styles.brand}>
        <Wordmark size={34} />
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.carousel}
        testID="welcome-carousel"
      >
        {slides.map((slide, i) => (
          <View
            key={slide.art}
            style={[styles.slide, { width }]}
            accessible
            accessibilityLabel={`${slide.title}. ${slide.body}`}
            accessibilityHint={`Slide ${i + 1} of ${slides.length}`}
          >
            <WelcomeArt kind={slide.art} size={artSize} />
            <View style={styles.copy}>
              <Text variant="title1" align="center" accessible={false}>
                {slide.title}
              </Text>
              <Text variant="callout" tone="muted" align="center" accessible={false}>
                {slide.body}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {slides.map((slide, i) => {
          const current = i === index;
          return (
            <PressableScale
              key={slide.art}
              accessibilityRole="button"
              accessibilityLabel={`Show slide ${i + 1} of ${slides.length}`}
              accessibilityState={{ selected: current }}
              onPress={() => goTo(i)}
              style={styles.dotTarget}
            >
              <View
                style={[
                  styles.dot,
                  {
                    width: current ? 22 : 8,
                    backgroundColor: current ? theme.colors.primary : theme.colors.borderStrong,
                  },
                ]}
              />
            </PressableScale>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Button
          testID="welcome-get-started"
          label="Get started"
          size="lg"
          fullWidth
          onPress={() => router.push('/continue')}
        />
        <Button
          testID="welcome-sign-in"
          label="I already have an account"
          variant="ghost"
          fullWidth
          onPress={() => router.push('/continue')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brand: { alignItems: 'center' },
  carousel: { flexGrow: 1 },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingHorizontal: gutter * 1.5,
  },
  copy: { gap: 10, maxWidth: 420 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  // The visible dot is small; the pressable area around it meets the 44pt minimum.
  dotTarget: { minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4 },
  actions: { paddingHorizontal: gutter, gap: 4 },
});
