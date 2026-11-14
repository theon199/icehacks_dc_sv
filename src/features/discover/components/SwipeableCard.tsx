import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { DeckCard } from '@/domain';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/ui';
import { motion, radii } from '@/ui/tokens';

import { flyOut } from './flyOut';
import { RecipeCard } from './RecipeCard';
import { RecipeCardBack } from './RecipeCardBack';
import { SwipeStamps } from './SwipeStamps';
import { cardAccessibilityLabel } from '../cardText';
import {
  STACK_OFFSET,
  STACK_SCALE,
  stackLift,
  swipeDirection,
  swipeDistance,
  tiltFor,
  type SwipeDirection,
} from '../swipe';

export type CardCommand = 'like' | 'pass' | 'save' | 'notForMe' | 'open' | 'flip' | 'unflip';

export interface SwipeableCardProps {
  card: DeckCard;
  /** 0 for the top card. */
  depth: number;
  width: number;
  /** The top card's drag progress towards a decision, 0..1; lower cards rise with it. */
  progress: SharedValue<number>;
  /** Where the leaving card flies: -1 left, 1 right, 0 up and out. Set before each decision. */
  exitDirection: SharedValue<number>;
  reduceMotion: boolean;
  /** The top card shows its back (details). Gestures pause until it turns back. */
  flipped: boolean;
  /** Undo is offered as a card action while the last swipe can still be taken back. */
  canUndo: boolean;
  onUndo: () => void;
  onCommand: (card: DeckCard, command: CardCommand) => void;
}

/** Depth of the flip; lower values exaggerate the perspective. */
const FLIP_PERSPECTIVE = 1200;
const FLIP_MS = 360;
/** Drag in points below which the card still counts as at rest. */
const AT_REST = 0.5;

const CARD_ACTIONS = [
  { name: 'activate', label: 'Show details' },
  { name: 'open', label: 'Open recipe' },
  { name: 'like', label: 'Like' },
  { name: 'pass', label: 'Pass' },
  { name: 'save', label: 'Save to cookbook' },
  { name: 'notForMe', label: 'Not for me' },
] as const;
const UNDO_ACTION = { name: 'undo', label: 'Undo last swipe' } as const;
const ACTIONS_WITH_UNDO = [...CARD_ACTIONS, UNDO_ACTION];

/**
 * One card in the stack. Only the top card takes gestures and is visible to VoiceOver. A tap turns
 * it over to its details; there, a tap or the close circle turns it back.
 */
export const SwipeableCard = memo(function SwipeableCard({
  card,
  depth,
  width,
  progress,
  exitDirection,
  reduceMotion,
  flipped,
  canUndo,
  onUndo,
  onCommand,
}: SwipeableCardProps) {
  const theme = useTheme();
  const isTop = depth === 0;
  const interactive = isTop && !flipped;
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const armed = useSharedValue(false);
  const level = useSharedValue(depth);
  const turn = useSharedValue(flipped ? 1 : 0);
  const [backMounted, setBackMounted] = useState(flipped);
  const distance = swipeDistance(width);

  // The back mounts as the flip starts and stays until the turn back has finished, so neither
  // direction plays against an empty face.
  useEffect(() => {
    if (flipped) setBackMounted(true);
    const done = (finished?: boolean) => {
      'worklet';
      if (finished && !flipped) scheduleOnRN(setBackMounted, false);
    };
    if (reduceMotion) {
      turn.set(flipped ? 1 : 0);
      if (!flipped) setBackMounted(false);
      return;
    }
    turn.set(
      withTiming(flipped ? 1 : 0, { duration: FLIP_MS, easing: Easing.inOut(Easing.cubic) }, done),
    );
  }, [flipped, reduceMotion, turn]);

  /** The melt drops its blur while the card is dragged, flying or turning. */
  const moving = useDerivedValue(
    () => Math.abs(x.get()) + Math.abs(y.get()) > AT_REST || turn.get() > 0,
  );

  // Moving up the stack: start from where the card visibly is, then settle at its new depth.
  useEffect(() => {
    const visible = stackLift(level.get(), progress.get());
    level.set(visible);
    level.set(reduceMotion ? depth : withTiming(depth, { duration: theme.motion.duration.fast }));
  }, [depth, level, progress, reduceMotion, theme.motion.duration.fast]);

  const command = useCallback((name: CardCommand) => onCommand(card, name), [card, onCommand]);
  const swiped = useCallback(
    (direction: SwipeDirection) => {
      haptics.impact(direction === 1 ? 'medium' : 'light');
      command(direction === 1 ? 'like' : 'pass');
    },
    [command],
  );
  const crossed = useCallback(() => haptics.selection(), []);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(interactive)
      .activeOffsetX([-12, 12])
      .activeOffsetY([-12, 12])
      .onUpdate((event) => {
        x.set(event.translationX);
        y.set(event.translationY * 0.3);
        const share = Math.min(1, Math.abs(event.translationX) / distance);
        progress.set(share);
        const past = share >= 1;
        if (past !== armed.get()) {
          armed.set(past);
          if (past) scheduleOnRN(crossed);
        }
      })
      .onEnd((event) => {
        const direction = swipeDirection(event.translationX, event.velocityX, distance);
        armed.set(false);
        if (direction !== 0) {
          exitDirection.set(direction);
          scheduleOnRN(swiped, direction);
          return;
        }
        x.set(withSpring(0, motion.spring.snappy));
        y.set(withSpring(0, motion.spring.snappy));
        progress.set(withSpring(0, motion.spring.snappy));
      });
    const tap = Gesture.Tap()
      .enabled(interactive)
      .onEnd((_event, success) => {
        if (success) scheduleOnRN(command, 'flip');
      });
    const hold = Gesture.LongPress()
      .enabled(interactive)
      .minDuration(450)
      .onStart(() => {
        scheduleOnRN(command, 'notForMe');
      });
    return Gesture.Race(pan, Gesture.Exclusive(hold, tap));
  }, [interactive, distance, x, y, progress, armed, exitDirection, crossed, swiped, command]);

  const cardStyle = useAnimatedStyle(() => {
    const lift = stackLift(level.get(), isTop ? 0 : progress.get());
    return {
      transform: [
        { translateX: x.get() },
        { translateY: y.get() + lift * STACK_OFFSET },
        { rotate: `${reduceMotion ? 0 : tiltFor(x.get(), width)}deg` },
        { scale: 1 - lift * STACK_SCALE },
      ],
    };
  });

  const exiting = useMemo(
    () =>
      reduceMotion
        ? FadeOut.duration(theme.motion.duration.fast)
        : flyOut(x, y, exitDirection, width),
    [reduceMotion, theme.motion.duration.fast, x, y, exitDirection, width],
  );

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: FLIP_PERSPECTIVE },
      { rotateY: `${interpolate(turn.get(), [0, 1], [0, 180])}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: FLIP_PERSPECTIVE },
      { rotateY: `${interpolate(turn.get(), [0, 1], [180, 360])}deg` },
    ],
  }));

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const name = event.nativeEvent.actionName;
      if (name === 'activate') command('flip');
      else if (name === 'open') command('open');
      else if (name === 'undo') onUndo();
      else if (name === 'like' || name === 'pass') {
        exitDirection.set(name === 'like' ? 1 : -1);
        command(name);
      } else if (name === 'save' || name === 'notForMe') {
        exitDirection.set(0);
        command(name);
      }
    },
    [command, exitDirection, onUndo],
  );
  const openRecipe = useCallback(() => command('open'), [command]);
  const turnBack = useCallback(() => command('unflip'), [command]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        testID={isTop ? 'discover-top-card' : undefined}
        entering={FadeIn.duration(theme.motion.duration.fast)}
        exiting={exiting}
        style={[
          StyleSheet.absoluteFill,
          styles.shadow,
          { zIndex: 10 - depth, ...theme.elevation.medium, shadowColor: theme.colors.shadow },
          cardStyle,
        ]}
        accessible={interactive}
        accessibilityRole={interactive ? 'button' : undefined}
        accessibilityLabel={interactive ? cardAccessibilityLabel(card) : undefined}
        accessibilityHint={
          interactive ? 'Shows why it fits. Use actions to open, like, pass or save.' : undefined
        }
        accessibilityActions={
          interactive ? (canUndo ? ACTIONS_WITH_UNDO : CARD_ACTIONS) : undefined
        }
        onAccessibilityAction={interactive ? onAccessibilityAction : undefined}
        accessibilityElementsHidden={!isTop}
        importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}
        pointerEvents={isTop ? 'auto' : 'none'}
      >
        <Animated.View
          style={[styles.face, frontStyle]}
          pointerEvents={flipped ? 'none' : 'auto'}
          accessibilityElementsHidden={flipped}
          importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
        >
          <RecipeCard card={card} isTop={isTop} moving={moving} />
          {isTop ? <SwipeStamps x={x} distance={distance} /> : null}
        </Animated.View>
        {isTop && backMounted ? (
          <Animated.View
            style={[styles.face, backStyle]}
            pointerEvents={flipped ? 'auto' : 'none'}
            accessibilityElementsHidden={!flipped}
            importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
          >
            <RecipeCardBack card={card} onClose={turnBack} onOpen={openRecipe} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  shadow: { borderRadius: radii.card },
  face: { ...StyleSheet.absoluteFill, backfaceVisibility: 'hidden' },
});
