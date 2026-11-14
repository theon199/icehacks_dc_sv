import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { WELCOME_TIMING } from './welcomeContent';
import { useWelcomeScale } from './welcomeScale';
import { night } from '../components/NightTheme';

/** A rectangle in design points, relative to the stage's top left. */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TILE_RADIUS = 20;
const FADE_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

/** One rounded tile of the collage, placed on the stage in design points. */
export function Tile({
  rect,
  style,
  children,
}: {
  rect: TileRect;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { px } = useWelcomeScale();
  return (
    <View
      style={[
        styles.tile,
        {
          left: px(rect.x),
          top: px(rect.y),
          width: px(rect.w),
          height: px(rect.h),
          borderRadius: px(TILE_RADIUS),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const FOOT_FADE = [night.tileFadeClear, night.tileFade] as const;
const HEAD_FADE = [night.tileFade, night.tileFadeClear] as const;

/** Dark fades that keep white copy legible on any dish: from the foot, or from the head. */
export function TileFade({ edge = 'foot' }: { edge?: 'foot' | 'head' }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={edge === 'foot' ? FOOT_FADE : HEAD_FADE}
      style={edge === 'foot' ? styles.foot : styles.head}
    />
  );
}

interface Layer<T> {
  id: number;
  value: T;
}

/**
 * Cross-fades from one value to the next: the new layer fades in over the old one, which is then
 * dropped. With `instant` the swap is immediate.
 */
export function Crossfade<T>({
  value,
  valueKey,
  instant,
  render,
}: {
  value: T | null;
  valueKey: string | null;
  instant: boolean;
  render: (value: T) => ReactNode;
}) {
  const [layers, setLayers] = useState<Layer<T>[]>(() =>
    value === null ? [] : [{ id: 0, value }],
  );
  const [shownKey, setShownKey] = useState(valueKey);

  // A new value is adopted during render, so its layer mounts in the same commit.
  if (valueKey !== shownKey) {
    setShownKey(valueKey);
    const id = (layers[layers.length - 1]?.id ?? 0) + 1;
    setLayers(
      value === null ? [] : instant ? [{ id, value }] : [...layers.slice(-1), { id, value }],
    );
  }

  useEffect(() => {
    if (layers.length < 2) return;
    const settle = setTimeout(
      () => setLayers((current) => current.slice(-1)),
      WELCOME_TIMING.crossfadeMs + 50,
    );
    return () => clearTimeout(settle);
  }, [layers]);

  return (
    <>
      {layers.map((layer) => (
        <FadeLayer key={layer.id} fadeIn={!instant && layer.id !== 0}>
          {render(layer.value)}
        </FadeLayer>
      ))}
    </>
  );
}

function FadeLayer({ fadeIn, children }: { fadeIn: boolean; children: ReactNode }) {
  const opacity = useSharedValue(fadeIn ? 0 : 1);
  useEffect(() => {
    if (!fadeIn) return;
    opacity.set(withTiming(1, { duration: WELCOME_TIMING.crossfadeMs, easing: FADE_EASE }));
  }, [fadeIn, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: { position: 'absolute', overflow: 'hidden', backgroundColor: night.raised },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  head: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%' },
});
