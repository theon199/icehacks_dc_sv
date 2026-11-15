import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon, Text, fontFamily, useTheme } from '@/ui';

import { night } from '../../components/NightTheme';
import { TimeTile } from '../RecipeTiles';
import { Crossfade, Tile, type TileRect } from '../Tile';
import { useSlideTimers } from '../useSlideTimers';
import { CHEF_EXAMPLES, WELCOME_TIMING } from '../welcomeContent';
import { confirmedAnswers, type WelcomeRecipe } from '../welcomeRecipes';
import { useWelcomeScale } from '../welcomeScale';
import type { SlideProps } from './slideProps';

const ASK_TILE: TileRect = { x: 0, y: 0, w: 254, h: 86 };
const ANSWER_TILES: readonly [TileRect, TileRect] = [
  { x: 0, y: 94, w: 123, h: 170 },
  { x: 131, y: 94, w: 123, h: 170 },
];
const ASK_BAR: TileRect = { x: 0, y: 272, w: 254, h: 58 };

interface Ask {
  prompt: string;
  run: number;
}

/** Slide three: a request types itself out and two catalog dishes that meet it appear. */
export function AskChefSlide({ animate, recipes }: SlideProps) {
  const theme = useTheme();
  const { font, px } = useWelcomeScale();
  // Only examples whose answers the catalog confirms are shown at all.
  const examples = useMemo(
    () =>
      CHEF_EXAMPLES.map((example) => ({
        prompt: example.prompt,
        answers: confirmedAnswers(recipes, example),
      })).filter((example) => example.answers.length === 2),
    [recipes],
  );
  const first = examples[0];
  const [ask, setAsk] = useState<Ask>({ prompt: first?.prompt ?? '', run: 0 });
  const [answers, setAnswers] = useState<readonly (string | null)[]>([null, null]);
  const turn = useRef(0);
  const timers = useSlideTimers(animate);

  // The resting frame (before motion, or with Reduce Motion) is the first example, answered.
  const [restingFor, setRestingFor] = useState<typeof examples | null>(null);
  if (restingFor !== examples) {
    setRestingFor(examples);
    setAsk((current) => ({ prompt: first?.prompt ?? '', run: current.run + 1 }));
    setAnswers(first ? first.answers : [null, null]);
  }

  useEffect(() => {
    if (!animate || examples.length === 0) return;
    const askOnce = () => {
      const example = examples[turn.current % examples.length];
      turn.current += 1;
      if (!example) return;
      setAsk((current) => ({ prompt: example.prompt, run: current.run + 1 }));
      const typed = example.prompt.length * WELCOME_TIMING.typeCharMs;
      example.answers.forEach((id, slot) => {
        timers.later(
          () =>
            setAnswers((current) => current.map((value, index) => (index === slot ? id : value))),
          typed +
            (slot === 0 ? WELCOME_TIMING.firstAnswerDelayMs : WELCOME_TIMING.secondAnswerDelayMs),
        );
      });
    };
    askOnce();
    timers.later(askOnce, WELCOME_TIMING.secondPromptAtMs);
    return timers.clear;
  }, [animate, examples, timers]);

  return (
    <>
      <Tile rect={ASK_TILE} style={{ paddingVertical: px(13), paddingHorizontal: px(14) }}>
        <Text allowFontScaling={false} style={[styles.askLabel, { fontSize: font(10.5) }]}>
          You asked
        </Text>
        <TypedPrompt key={ask.run} text={ask.prompt} animate={animate} />
      </Tile>
      {ANSWER_TILES.map((rect, slot) => {
        const id = answers[slot] ?? null;
        return (
          <Tile key={slot} rect={rect}>
            <Crossfade<WelcomeRecipe>
              instant={!animate}
              value={id ? (recipes.get(id) ?? null) : null}
              valueKey={id}
              render={(recipe) => <TimeTile recipe={recipe} />}
            />
          </Tile>
        );
      })}
      <Tile
        rect={ASK_BAR}
        style={[
          styles.bar,
          { backgroundColor: theme.colors.highlight, paddingLeft: px(16), paddingRight: px(8) },
        ]}
      >
        <Text
          allowFontScaling={false}
          color="onHighlight"
          style={[styles.barLabel, { fontSize: font(19), letterSpacing: -px(0.5) }]}
        >
          Ask Chef
        </Text>
        <View
          style={[
            styles.send,
            {
              width: px(40),
              height: px(40),
              borderRadius: px(20),
              backgroundColor: theme.colors.onHighlight,
            },
          ]}
        >
          <Icon name="arrow.up" size={px(18)} color="highlight" />
        </View>
      </Tile>
    </>
  );
}

/** Types `text` one character at a time behind a blinking lime caret. */
function TypedPrompt({ text, animate }: { text: string; animate: boolean }) {
  const theme = useTheme();
  const { font, px } = useWelcomeScale();
  const [shown, setShown] = useState(animate ? 0 : text.length);
  const caret = useSharedValue(1);

  useEffect(() => {
    if (!animate) return;
    let count = 0;
    const typer = setInterval(() => {
      count += 1;
      setShown(count);
      if (count >= text.length) clearInterval(typer);
    }, WELCOME_TIMING.typeCharMs);
    return () => clearInterval(typer);
  }, [animate, text]);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(caret);
      caret.set(1);
      return;
    }
    const half = WELCOME_TIMING.caretBlinkMs;
    caret.set(
      withRepeat(
        withSequence(
          withDelay(half, withTiming(0, { duration: 0 })),
          withDelay(half, withTiming(1, { duration: 0 })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(caret);
  }, [animate, caret]);

  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.get() }));
  const size = font(16);

  return (
    <Text
      allowFontScaling={false}
      numberOfLines={2}
      style={[styles.prompt, { fontSize: size, lineHeight: size * 1.2, marginTop: px(5) }]}
    >
      {animate ? text.slice(0, shown) : text}
      <Animated.View
        style={[
          {
            width: px(2),
            height: size,
            marginLeft: px(2),
            backgroundColor: theme.colors.highlight,
          },
          caretStyle,
        ]}
      />
    </Text>
  );
}

const styles = StyleSheet.create({
  askLabel: { color: night.ink, fontFamily: fontFamily.textSemiBold, opacity: 0.55 },
  prompt: { color: night.ink, fontFamily: fontFamily.textSemiBold },
  bar: { flexDirection: 'row', alignItems: 'center' },
  barLabel: { flex: 1, fontFamily: fontFamily.display },
  send: { alignItems: 'center', justifyContent: 'center' },
});
