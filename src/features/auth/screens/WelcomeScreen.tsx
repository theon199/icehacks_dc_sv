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
import { Button, PressableScale, Text, gutter, space, useTheme } from '@/ui';
import { Wordmark } from '@/ui/brand';

import { night } from '../components/NightTheme';
import { WelcomeArt, type WelcomeArtKind } from '../components/WelcomeArt';

interface Slide {
  art: WelcomeArtKind;
  /** The headline's first words, in white. */
  lead: string;
  /** The headline's last words, in lime. */
  accent: string;
  body: string;
}

const slides: readonly Slide[] = [
  {
    art: 'bowl',
    lead: 'The food you love,',
    accent: 'a little lighter.',
    body: 'Famara finds better-for-you versions of the dishes you grew up with, from every corner of the world.',
  },
  {
    art: 'fit',
    lead: 'Know why each',
    accent: 'recipe fits.',
    body: 'Every suggestion shows its reasons: more fiber, less salt, safe for your allergies, ready in your time.',
  },
  {
    art: 'plan',
    lead: 'Plan, cook and shop',
    accent: 'in one place.',
    body: 'Build your week, cook step by step and turn the plan into a shopping list.',
  },
];

// Dots sit closer than 44pt apart; the slop brings each target up to the minimum.
const DOT_SLOP = { left: 6, right: 6 };

/** First screen for signed-out people: three slides on a night canvas and the way in. */
export function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const artWidth = width - gutter * 2;
  const artHeight = Math.round(Math.min(height * 0.36, artWidth * 0.95));

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
          backgroundColor: night.black,
          paddingTop: insets.top + space.sm,
          paddingBottom: Math.max(insets.bottom, space.lg),
        },
      ]}
    >
      <View style={styles.topRow}>
        <Wordmark size={30} />
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
                hitSlop={DOT_SLOP}
                style={styles.dotTarget}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      width: current ? 22 : 8,
                      backgroundColor: current ? theme.colors.text : theme.colors.borderStrong,
                    },
                  ]}
                />
              </PressableScale>
            );
          })}
        </View>
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
            accessibilityLabel={`${slide.lead} ${slide.accent} ${slide.body}`}
            accessibilityHint={`Slide ${i + 1} of ${slides.length}`}
          >
            <WelcomeArt kind={slide.art} width={artWidth} height={artHeight} />
            <View style={styles.copy}>
              <Text
                variant="display"
                style={styles.headline}
                maxFontSizeMultiplier={1.2}
                accessible={false}
              >
                {`${slide.lead}\n`}
                <Text variant="display" color="highlight" style={styles.headline}>
                  {slide.accent}
                </Text>
              </Text>
              <Text variant="callout" tone="muted" accessible={false}>
                {slide.body}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

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
          label="Log in"
          variant="ghost"
          size="lg"
          fullWidth
          accessibilityHint="For people who already have an account"
          onPress={() => router.push('/continue')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: gutter,
    paddingRight: gutter - space.md,
  },
  carousel: { flexGrow: 1 },
  slide: {
    justifyContent: 'center',
    gap: space.xxl,
    paddingHorizontal: gutter,
  },
  copy: { gap: space.md, maxWidth: 520 },
  headline: { fontSize: 42, lineHeight: 46, letterSpacing: -1.1 },
  dots: { flexDirection: 'row', alignItems: 'center' },
  // The visible dot is small; the pressable area around it meets the 44pt minimum.
  dotTarget: { minWidth: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4 },
  actions: { paddingHorizontal: gutter, paddingTop: space.md, gap: space.xs },
});
