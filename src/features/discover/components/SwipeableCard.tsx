import { memo, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { DeckCard } from '@/domain';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/ui';
import { motion } from '@/ui/tokens';

import { flyOut } from './flyOut';
import { RecipeCard } from './RecipeCard';
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

export type CardCommand = 'like' | 'pass' | 'save' | 'notForMe' | 'open';

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
  onCommand: (card: DeckCard, command: CardCommand) => void;
}

const ACCESSIBILITY_ACTIONS = [
  { name: 'activate', label: 'Open recipe' },
  { name: 'like', label: 'Like' },
  { name: 'pass', label: 'Pass' },
  { name: 'save', label: 'Save to cookbook' },
  { name: 'notForMe', label: 'Not for me' },
] as const;

/** One card in the stack. Only the top card takes gestures and is visible to VoiceOver. */
export const SwipeableCard = memo(function SwipeableCard({
  card,
  depth,
  width,
  progress,
  exitDirection,
  reduceMotion,
  onCommand,
}: SwipeableCardProps) {
  const theme = useTheme();
  const isTop = depth === 0;
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const armed = useSharedValue(false);
  const level = useSharedValue(depth);
  const distance = swipeDistance(width);

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
      .enabled(isTop)
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
      .enabled(isTop)
      .onEnd((_event, success) => {
        if (success) scheduleOnRN(command, 'open');
      });
    const hold = Gesture.LongPress()
      .enabled(isTop)
      .minDuration(450)
      .onStart(() => {
        scheduleOnRN(command, 'notForMe');
      });
    return Gesture.Race(pan, Gesture.Exclusive(hold, tap));
  }, [isTop, distance, x, y, progress, armed, exitDirection, crossed, swiped, command]);

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

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const name = event.nativeEvent.actionName;
      if (name === 'activate') command('open');
      else if (name === 'like' || name === 'pass') {
        exitDirection.set(name === 'like' ? 1 : -1);
        command(name);
      } else if (name === 'save' || name === 'notForMe') {
        exitDirection.set(0);
        command(name);
      }
    },
    [command, exitDirection],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        testID={isTop ? 'discover-top-card' : undefined}
        entering={FadeIn.duration(theme.motion.duration.fast)}
        exiting={exiting}
        style={[StyleSheet.absoluteFill, { zIndex: 10 - depth }, cardStyle]}
        accessible={isTop}
        accessibilityRole={isTop ? 'button' : undefined}
        accessibilityLabel={isTop ? cardAccessibilityLabel(card) : undefined}
        accessibilityHint={
          isTop ? 'Opens the recipe. Use actions to like, pass or save.' : undefined
        }
        accessibilityActions={isTop ? ACCESSIBILITY_ACTIONS : undefined}
        onAccessibilityAction={isTop ? onAccessibilityAction : undefined}
        accessibilityElementsHidden={!isTop}
        importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}
        pointerEvents={isTop ? 'auto' : 'none'}
      >
        <RecipeCard card={card} isTop={isTop} />
        {isTop ? <SwipeStamps x={x} distance={distance} /> : null}
      </Animated.View>
    </GestureDetector>
  );
});
