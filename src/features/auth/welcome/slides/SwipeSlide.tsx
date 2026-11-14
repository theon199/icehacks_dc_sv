import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Text, fontFamily, useTheme } from '@/ui';

import { night } from '../../components/NightTheme';
import { NameTile, SavedTile } from '../RecipeTiles';
import { Crossfade, Tile, type TileRect } from '../Tile';
import { useSlideTimers } from '../useSlideTimers';
import { SWIPE_FIRST_SAVED, SWIPE_POOL, WELCOME_TIMING } from '../welcomeContent';
import { availableIds, type WelcomeRecipe } from '../welcomeRecipes';
import { useWelcomeScale } from '../welcomeScale';
import type { SlideProps } from './slideProps';

const STACK: TileRect = { x: 0, y: 0, w: 254, h: 204 };
const SAVED_TILE: TileRect = { x: 0, y: 212, w: 146, h: 118 };
const HINT_TILE: TileRect = { x: 154, y: 212, w: 100, h: 118 };
const CARD_RADIUS = 22;

type Verdict = 'save' | 'pass';
type Pose = 'back' | 'front' | Verdict;
interface Card {
  key: number;
  recipeId: string;
  verdict: Verdict | null;
}

/** Where a card sits in each pose, in design points and degrees. */
const POSES: Record<
  Pose,
  {
    x: number;
    y: number;
    rotate: number;
    scale: number;
    opacity: number;
    saved: number;
    passed: number;
  }
> = {
  back: { x: 0, y: 10, rotate: 0, scale: 0.93, opacity: 0.55, saved: 0, passed: 0 },
  front: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, saved: 0, passed: 0 },
  save: { x: 290, y: 0, rotate: 14, scale: 1, opacity: 1, saved: 1, passed: 0 },
  pass: { x: 0, y: 330, rotate: -3, scale: 1, opacity: 0, saved: 0, passed: 1 },
};

const MOTION_EASE = Easing.bezier(0.3, 0.7, 0.25, 1);
const FADE_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

function openingPair(pool: readonly string[], firstKey: number): Card[] {
  return pool.slice(0, 2).map((recipeId, offset) => ({
    key: firstKey + offset,
    recipeId,
    verdict: null,
  }));
}

function poseOf(deck: readonly Card[], index: number): Pose {
  const card = deck[index];
  if (card?.verdict) return card.verdict;
  return index === deck.findIndex((entry) => entry.verdict === null) ? 'front' : 'back';
}

/** Slide two: a card is kept (right), the next one passed (down), and the Saved tile follows. */
export function SwipeSlide({ animate, recipes }: SlideProps) {
  const theme = useTheme();
  const { font, px } = useWelcomeScale();
  const pool = useMemo(() => availableIds(recipes, SWIPE_POOL), [recipes]);
  const nextKey = useRef(0);
  const [deck, setDeck] = useState<Card[]>([]);
  const deckRef = useRef(deck);
  const [savedId, setSavedId] = useState<string | null>(null);
  const timers = useSlideTimers(animate);
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  // Deal the opening pair (and the first saved dish) once the catalog read lands.
  const [dealtFor, setDealtFor] = useState<readonly string[] | null>(null);
  if (dealtFor !== pool) {
    setDealtFor(pool);
    // Negative keys never clash with the ones the choreography deals from `nextKey`.
    setDeck(openingPair(pool, -2));
    setSavedId(recipes.has(SWIPE_FIRST_SAVED) ? SWIPE_FIRST_SAVED : (pool[0] ?? null));
  }

  useEffect(() => {
    if (!animate || pool.length < 2) return;
    const commit = (next: Card[]) => {
      deckRef.current = next;
      setDeck(next);
    };
    // Every visit starts from the same opening pair.
    const opening = openingPair(pool, nextKey.current);
    nextKey.current += opening.length;
    commit(opening);
    let dealt = 0;

    const swipe = (verdict: Verdict) => {
      const [front, ...rest] = deckRef.current;
      if (!front) return;
      commit([{ ...front, verdict }, ...rest]);
      if (verdict === 'save') {
        timers.later(() => setSavedId(front.recipeId), WELCOME_TIMING.savedTileAtMs);
      }
      timers.later(() => {
        dealt += 1;
        const recipeId = pool[(dealt + 1) % pool.length];
        const remaining = deckRef.current.filter((card) => card.key !== front.key);
        commit(
          recipeId
            ? [...remaining, { key: nextKey.current++, recipeId, verdict: null }]
            : remaining,
        );
      }, WELCOME_TIMING.restackAtMs);
    };

    timers.later(() => swipe('save'), WELCOME_TIMING.swipeSaveAtMs);
    timers.later(() => swipe('pass'), WELCOME_TIMING.swipePassAtMs);
    return timers.clear;
  }, [animate, pool, timers]);

  const saved = savedId ? (recipes.get(savedId) ?? null) : null;

  return (
    <>
      <Tile rect={SAVED_TILE}>
        <Crossfade<WelcomeRecipe>
          instant={!animate}
          value={saved}
          valueKey={savedId}
          render={(recipe) => <SavedTile recipe={recipe} />}
        />
      </Tile>
      <Tile rect={HINT_TILE} style={[styles.hint, { padding: px(12) }]}>
        <Text allowFontScaling={false} style={[styles.hintLabel, { fontSize: font(10.5) }]}>
          Swipe
        </Text>
        <Text
          allowFontScaling={false}
          style={[
            styles.hintTitle,
            { fontSize: font(21), lineHeight: font(21) * 1.15, letterSpacing: -px(0.6) },
          ]}
        >
          {'→ keep\n'}
          <Text
            allowFontScaling={false}
            style={[styles.hintTitle, styles.hintFaint, { fontSize: font(21) }]}
          >
            ↓ pass
          </Text>
        </Text>
      </Tile>
      <View
        pointerEvents="none"
        style={[
          styles.stack,
          { left: px(STACK.x), top: px(STACK.y), width: px(STACK.w), height: px(STACK.h) },
        ]}
      >
        {deck
          .map((card, index) => ({ card, pose: poseOf(deck, index) }))
          .reverse()
          .map(({ card, pose }) => {
            const recipe = recipes.get(card.recipeId);
            return recipe ? (
              <SwipeCard
                key={card.key}
                pose={pose}
                recipe={recipe}
                stampInk={theme.colors.onHighlight}
              />
            ) : null;
          })}
      </View>
    </>
  );
}

function SwipeCard({
  pose,
  recipe,
  stampInk,
}: {
  pose: Pose;
  recipe: WelcomeRecipe;
  stampInk: string;
}) {
  const theme = useTheme();
  const { font, px } = useWelcomeScale();
  const start = POSES[pose];
  const x = useSharedValue(px(start.x));
  const y = useSharedValue(px(start.y));
  const rotate = useSharedValue(start.rotate);
  const scale = useSharedValue(start.scale);
  const opacity = useSharedValue(start.opacity);
  const saved = useSharedValue(start.saved);
  const passed = useSharedValue(start.passed);
  const shown = useRef(pose);

  useEffect(() => {
    if (shown.current === pose) return;
    shown.current = pose;
    const target = POSES[pose];
    const move = { duration: WELCOME_TIMING.swipeMotionMs, easing: MOTION_EASE };
    const stamp = { duration: WELCOME_TIMING.stampFadeMs, easing: FADE_EASE };
    x.set(withTiming(px(target.x), move));
    y.set(withTiming(px(target.y), move));
    rotate.set(withTiming(target.rotate, move));
    scale.set(withTiming(target.scale, move));
    opacity.set(
      withTiming(target.opacity, { duration: WELCOME_TIMING.swipeMotionMs, easing: FADE_EASE }),
    );
    saved.set(withTiming(target.saved, stamp));
    passed.set(withTiming(target.passed, stamp));
  }, [opacity, passed, pose, px, rotate, saved, scale, x, y]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      { rotate: `${rotate.get()}deg` },
      { scale: scale.get() },
    ],
  }));
  const savedStyle = useAnimatedStyle(() => ({ opacity: saved.get() }));
  const passedStyle = useAnimatedStyle(() => ({ opacity: passed.get() }));

  const stampFrame = {
    top: px(14),
    paddingHorizontal: px(10),
    paddingVertical: px(4),
    borderRadius: px(8),
  };
  const stampText = [
    styles.stampText,
    { color: stampInk, fontSize: font(13), lineHeight: font(13) * 1.25 },
  ];

  return (
    <Animated.View style={[styles.card, { borderRadius: px(CARD_RADIUS) }, cardStyle]}>
      <NameTile recipe={recipe} />
      <Animated.View
        style={[
          styles.stamp,
          stampFrame,
          { left: px(14), backgroundColor: theme.colors.highlight },
          styles.tiltLeft,
          savedStyle,
        ]}
      >
        <Text allowFontScaling={false} style={stampText}>
          Saved
        </Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.stamp,
          stampFrame,
          { right: px(14), backgroundColor: night.ink },
          styles.tiltRight,
          passedStyle,
        ]}
      >
        <Text allowFontScaling={false} style={stampText}>
          Pass
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', zIndex: 5 },
  card: { ...StyleSheet.absoluteFill, overflow: 'hidden', backgroundColor: night.raised },
  stamp: { position: 'absolute', zIndex: 3 },
  tiltLeft: { transform: [{ rotate: '-8deg' }] },
  tiltRight: { transform: [{ rotate: '8deg' }] },
  stampText: { fontFamily: fontFamily.textBold },
  hint: { justifyContent: 'space-between' },
  hintLabel: { color: night.ink, fontFamily: fontFamily.textSemiBold, opacity: 0.6 },
  hintTitle: { color: night.ink, fontFamily: fontFamily.display },
  hintFaint: { color: night.inkFaint },
});
