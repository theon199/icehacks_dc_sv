import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { Wordmark } from '@/ui/brand';

import { Headline } from './Headline';
import { PageDots } from './PageDots';
import { AskChefSlide } from './slides/AskChefSlide';
import { ForYouSlide } from './slides/ForYouSlide';
import { PlanSlide } from './slides/PlanSlide';
import type { SlideProps } from './slides/slideProps';
import { SwipeSlide } from './slides/SwipeSlide';
import { useSlideClock } from './useSlideClock';
import {
  WELCOME_SLIDES,
  WELCOME_TIMING,
  headlineText,
  type WelcomeSlideKey,
} from './welcomeContent';
import { useWelcomeRecipes } from './welcomeRecipes';
import { DESIGN, WelcomeScaleProvider, useWelcomeScale } from './welcomeScale';

const SWIPE_DISTANCE = 40;
const SWIPE_VELOCITY = 600;
/** Room kept under the pager for the buttons before the first layout. */
const ESTIMATED_CHROME = 260;
const WORDMARK_HEIGHT = 22;

/**
 * The welcome carousel: wordmark and page indicator on top, four collages that cross-fade in
 * place, one headline each. It moves on by itself every seven seconds unless `paused` or Reduce
 * Motion is on; swipes and the indicator always work.
 */
export function WelcomeCarousel({ paused }: { paused: boolean }) {
  const window = useWindowDimensions();
  const [size, setSize] = useState({
    width: window.width,
    height: Math.max(0, window.height - ESTIMATED_CHROME),
  });
  const onPagerLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  return (
    <WelcomeScaleProvider width={size.width} height={size.height}>
      <CarouselBody paused={paused} onPagerLayout={onPagerLayout} />
    </WelcomeScaleProvider>
  );
}

function CarouselBody({
  paused,
  onPagerLayout,
}: {
  paused: boolean;
  onPagerLayout: (event: LayoutChangeEvent) => void;
}) {
  const reduceMotion = useReducedMotion();
  const recipes = useWelcomeRecipes();
  const { px } = useWelcomeScale();
  const count = WELCOME_SLIDES.length;
  const { index, goTo, progress } = useSlideClock({
    count,
    durationMs: WELCOME_TIMING.slideMs,
    running: !paused && !reduceMotion,
  });

  const select = useCallback(
    (next: number) => {
      if (next === index) return;
      haptics.selection();
      goTo(next);
    },
    [goTo, index],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-16, 16])
        .failOffsetY([-16, 16])
        .onEnd((event) => {
          if (event.translationX <= -SWIPE_DISTANCE || event.velocityX <= -SWIPE_VELOCITY) {
            select(index + 1);
          } else if (event.translationX >= SWIPE_DISTANCE || event.velocityX >= SWIPE_VELOCITY) {
            select(index - 1);
          }
        }),
    [index, select],
  );

  const stageWidth = px(DESIGN.stageWidth);
  const headlineTop = px(DESIGN.stageHeight + DESIGN.headlineGap);
  const frameHeight =
    headlineTop + px(DESIGN.headlineSize * DESIGN.headlineLineHeight * DESIGN.headlineLines);
  const current = WELCOME_SLIDES[index];

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          { width: stageWidth, paddingLeft: px(DESIGN.headlineInset), paddingRight: px(4) },
        ]}
      >
        <Wordmark height={WORDMARK_HEIGHT} />
        <PageDots
          count={count}
          index={index}
          progress={progress}
          staticFill={reduceMotion}
          onSelect={select}
        />
      </View>
      <GestureDetector gesture={pan}>
        <View
          onLayout={onPagerLayout}
          style={styles.pager}
          testID="welcome-carousel"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={current ? headlineText(current.headline) : ''}
          accessibilityValue={{ text: `Page ${index + 1} of ${count}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment')
              select(Math.min(count - 1, index + 1));
            if (event.nativeEvent.actionName === 'decrement') select(Math.max(0, index - 1));
          }}
        >
          <View style={{ width: stageWidth, height: frameHeight, marginTop: px(12) }}>
            {WELCOME_SLIDES.map((slide, slideIndex) => {
              const active = slideIndex === index;
              return (
                <SlideFrame key={slide.key} active={active} instant={reduceMotion}>
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={StyleSheet.absoluteFill}
                  >
                    <SlideArt
                      slide={slide.key}
                      animate={active && !reduceMotion && !paused}
                      recipes={recipes}
                    />
                  </View>
                  <View
                    style={[
                      styles.headline,
                      {
                        top: headlineTop,
                        left: px(DESIGN.headlineInset),
                        right: px(DESIGN.headlineInset),
                      },
                    ]}
                  >
                    <Headline runs={slide.headline} />
                  </View>
                </SlideFrame>
              );
            })}
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

function SlideArt({ slide, ...props }: SlideProps & { slide: WelcomeSlideKey }) {
  switch (slide) {
    case 'for-you':
      return <ForYouSlide {...props} />;
    case 'swipe':
      return <SwipeSlide {...props} />;
    case 'ask-chef':
      return <AskChefSlide {...props} />;
    case 'plan':
      return <PlanSlide {...props} />;
  }
}

/** Cross-fades a page in and out. */
function SlideFrame({
  active,
  instant,
  children,
}: {
  active: boolean;
  instant: boolean;
  children: ReactNode;
}) {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    const target = active ? 1 : 0;
    opacity.set(
      instant
        ? target
        : withTiming(target, {
            duration: WELCOME_TIMING.slideFadeMs,
            easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          }),
    );
  }, [active, instant, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pager: { flex: 1, alignSelf: 'stretch', alignItems: 'center' },
  headline: { position: 'absolute' },
});
