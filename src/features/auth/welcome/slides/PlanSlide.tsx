import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon, Text, fontFamily, useTheme, type Palette } from '@/ui';

import { night } from '../../components/NightTheme';
import { RecipePhoto } from '../RecipeTiles';
import { Tile, TileFade, type TileRect } from '../Tile';
import { PLAN_MEALS, WELCOME_TIMING } from '../welcomeContent';
import { planDays, planRangeLabel, type PlanDay } from '../welcomeDates';
import { useWelcomeScale } from '../welcomeScale';
import type { SlideProps } from './slideProps';

const DAY_TILES: readonly [TileRect, TileRect, TileRect] = [
  { x: 0, y: 0, w: 81, h: 206 },
  { x: 86, y: 0, w: 82, h: 206 },
  { x: 173, y: 0, w: 81, h: 206 },
];
const WEEK_TILE: TileRect = { x: 0, y: 214, w: 146, h: 116 };
const FRIENDS_TILE: TileRect = { x: 154, y: 214, w: 100, h: 116 };

type HeartColor = keyof Pick<Palette, 'highlight' | 'onImage' | 'accent'>;

/** Six hearts rising from the Friends tile: left edge, start delay, colour, size, drift. */
const HEARTS: readonly {
  left: number;
  delayMs: number;
  color: HeartColor;
  size: number;
  drift: number;
}[] = [
  { left: 10, delayMs: 0, color: 'highlight', size: 24, drift: 16 },
  { left: 46, delayMs: 450, color: 'onImage', size: 16, drift: -10 },
  { left: 64, delayMs: 900, color: 'accent', size: 20, drift: 6 },
  { left: 28, delayMs: 1350, color: 'highlight', size: 15, drift: -12 },
  { left: 56, delayMs: 1800, color: 'onImage', size: 22, drift: 10 },
  { left: 16, delayMs: 2250, color: 'accent', size: 18, drift: 8 },
];
const HEART_RISE = 118;

/** Three overlapping discs standing for friends; plain colour, no faces or names. */
const FRIEND_DISCS: readonly (keyof Palette)[] = ['accent', 'success', 'warning'];

/** Slide four: three planned days, the week's range, and friends reacting. */
export function PlanSlide({ animate, recipes }: SlideProps) {
  const theme = useTheme();
  const { font, px } = useWelcomeScale();
  const [now] = useState(() => new Date());
  const days = useMemo(() => planDays(now, DAY_TILES.length), [now]);

  return (
    <>
      {DAY_TILES.map((rect, index) => {
        const id = PLAN_MEALS[index];
        const recipe = id ? recipes.get(id) : undefined;
        const day = days[index];
        return (
          <Tile key={index} rect={rect}>
            {recipe ? <RecipePhoto recipe={recipe} zoom={1.5} /> : null}
            <TileFade edge="head" />
            {day ? <DayLabel day={day} /> : null}
          </Tile>
        );
      })}
      <Tile
        rect={WEEK_TILE}
        style={[styles.week, { backgroundColor: theme.colors.highlight, padding: px(12) }]}
      >
        <Text
          allowFontScaling={false}
          color="onHighlight"
          style={[styles.label, { fontSize: font(10.5) }]}
        >
          This week
        </Text>
        <Text
          allowFontScaling={false}
          color="onHighlight"
          style={[
            styles.weekTitle,
            { fontSize: font(22), lineHeight: font(22) * 1.05, letterSpacing: -px(0.7) },
          ]}
        >
          {`Planned,\n${planRangeLabel(days)}`}
        </Text>
      </Tile>
      <Tile rect={FRIENDS_TILE} style={{ padding: px(12) }}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {HEARTS.map((heart, index) => (
            <FloatingHeart key={index} heart={heart} animate={animate} />
          ))}
        </View>
        <Text
          allowFontScaling={false}
          style={[styles.label, styles.friends, { fontSize: font(10.5) }]}
        >
          Friends
        </Text>
        <View style={[styles.discs, { left: px(12), bottom: px(12) }]}>
          {FRIEND_DISCS.map((color, index) => (
            <View
              key={color}
              style={[
                styles.disc,
                {
                  width: px(22),
                  height: px(22),
                  borderRadius: px(11),
                  borderWidth: px(2),
                  marginLeft: index === 0 ? 0 : -px(7),
                  backgroundColor: theme.colors[color],
                },
              ]}
            />
          ))}
        </View>
      </Tile>
    </>
  );
}

function DayLabel({ day }: { day: PlanDay }) {
  const { font, px } = useWelcomeScale();
  return (
    <View style={[styles.date, { top: px(9), left: px(10) }]}>
      <Text
        allowFontScaling={false}
        style={[styles.weekday, { fontSize: font(9.5), lineHeight: font(9.5) * 1.1 }]}
      >
        {day.weekday}
      </Text>
      <Text
        allowFontScaling={false}
        style={[styles.day, { fontSize: font(15), lineHeight: font(15) * 1.1 }]}
      >
        {day.day}
      </Text>
    </View>
  );
}

function FloatingHeart({ heart, animate }: { heart: (typeof HEARTS)[number]; animate: boolean }) {
  const { px } = useWelcomeScale();
  // Without motion each heart rests at its own point of the rise, a still frame of the stream.
  const resting = heart.delayMs / WELCOME_TIMING.heartFloatMs;
  const progress = useSharedValue(resting);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(progress);
      progress.set(resting);
      return;
    }
    progress.set(0);
    progress.set(
      withDelay(
        heart.delayMs,
        withRepeat(
          withTiming(1, { duration: WELCOME_TIMING.heartFloatMs, easing: Easing.in(Easing.ease) }),
          -1,
        ),
      ),
    );
    return () => cancelAnimation(progress);
  }, [animate, heart.delayMs, progress, resting]);

  const rise = px(HEART_RISE);
  const drift = px(heart.drift);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.15, 1], [0, 1, 0]),
    transform: [
      { translateX: drift * progress.get() },
      { translateY: -rise * progress.get() },
      { scale: 0.5 + 0.6 * progress.get() },
    ],
  }));

  return (
    <Animated.View style={[styles.heart, { left: px(heart.left), bottom: -px(14) }, style]}>
      <Icon name="heart.fill" size={px(heart.size)} color={heart.color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  date: { position: 'absolute' },
  weekday: { color: night.ink, fontFamily: fontFamily.textSemiBold, opacity: 0.8 },
  day: { color: night.ink, fontFamily: fontFamily.textBold },
  week: { justifyContent: 'space-between' },
  label: { fontFamily: fontFamily.textSemiBold, opacity: 0.7 },
  weekTitle: { fontFamily: fontFamily.display },
  friends: { color: night.ink, opacity: 0.6 },
  discs: { position: 'absolute', flexDirection: 'row' },
  disc: { borderColor: night.raised },
  heart: { position: 'absolute' },
});
