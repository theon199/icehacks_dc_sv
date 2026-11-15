import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Text, fontFamily, useTheme } from '@/ui';

import { StatTile } from '../RecipeTiles';
import { Crossfade, Tile, type TileRect } from '../Tile';
import { useSlideTimers } from '../useSlideTimers';
import { FOR_YOU_POOL, WELCOME_TIMING } from '../welcomeContent';
import { availableIds, type WelcomeRecipe } from '../welcomeRecipes';
import { useWelcomeScale } from '../welcomeScale';
import type { SlideProps } from './slideProps';

/** The four photo tiles, in the order they take turns to change dish. */
const PHOTO_TILES: readonly { rect: TileRect; withName: boolean; narrow: boolean }[] = [
  { rect: { x: 0, y: 0, w: 146, h: 212 }, withName: true, narrow: false },
  { rect: { x: 154, y: 110, w: 100, h: 102 }, withName: false, narrow: true },
  { rect: { x: 0, y: 220, w: 146, h: 110 }, withName: false, narrow: false },
  { rect: { x: 154, y: 220, w: 100, h: 110 }, withName: false, narrow: true },
];
const TODAY_TILE: TileRect = { x: 154, y: 0, w: 100, h: 102 };

/**
 * The next dish for a tile: the first pool entry after `cursor` that is not already showing.
 * Deterministic, so every visitor sees the same order.
 */
export function nextPick(
  pool: readonly string[],
  showing: readonly (string | null)[],
  cursor: number,
): { id: string; cursor: number } | null {
  for (let step = 0; step < pool.length; step += 1) {
    const position = (cursor + step) % pool.length;
    const id = pool[position];
    if (id !== undefined && !showing.includes(id)) return { id, cursor: position + 1 };
  }
  return null;
}

export function ForYouSlide({ animate, recipes }: SlideProps) {
  const pool = useMemo(
    () => availableIds(recipes, FOR_YOU_POOL, { requireProtein: true }),
    [recipes],
  );
  const [showing, setShowing] = useState<(string | null)[]>([]);
  const showingRef = useRef(showing);
  const turn = useRef(0);
  const cursor = useRef(PHOTO_TILES.length);
  const timers = useSlideTimers(animate);

  // Deal the opening four once the catalog read lands.
  const [dealtFor, setDealtFor] = useState<readonly string[] | null>(null);
  if (dealtFor !== pool) {
    setDealtFor(pool);
    setShowing(PHOTO_TILES.map((_tile, index) => pool[index] ?? null));
  }
  useEffect(() => {
    showingRef.current = showing;
  }, [showing]);

  useEffect(() => {
    if (!animate) return;
    timers.every(() => {
      const tile = turn.current;
      turn.current = (tile + 1) % PHOTO_TILES.length;
      const pick = nextPick(pool, showingRef.current, cursor.current);
      if (!pick) return;
      cursor.current = pick.cursor;
      const next = [...showingRef.current];
      next[tile] = pick.id;
      showingRef.current = next;
      setShowing(next);
    }, WELCOME_TIMING.tileSwapMs);
    return timers.clear;
  }, [animate, pool, timers]);

  return (
    <>
      {PHOTO_TILES.map((tile, index) => {
        const id = showing[index] ?? null;
        return (
          <Tile key={index} rect={tile.rect}>
            <Crossfade<WelcomeRecipe>
              instant={!animate}
              value={id ? (recipes.get(id) ?? null) : null}
              valueKey={id}
              render={(recipe) => (
                <StatTile recipe={recipe} withName={tile.withName} narrow={tile.narrow} />
              )}
            />
          </Tile>
        );
      })}
      <TodayTile />
    </>
  );
}

function TodayTile() {
  const theme = useTheme();
  const { font, px } = useWelcomeScale();
  return (
    <Tile rect={TODAY_TILE} style={{ backgroundColor: theme.colors.highlight, padding: px(11) }}>
      <Text
        allowFontScaling={false}
        color="onHighlight"
        style={[styles.label, { fontSize: font(10.5), lineHeight: font(10.5) * 1.3 }]}
      >
        Today
      </Text>
      <Text
        allowFontScaling={false}
        color="onHighlight"
        style={[
          styles.title,
          {
            fontSize: font(24),
            lineHeight: font(24),
            letterSpacing: -px(0.8),
            marginTop: px(22),
          },
        ]}
      >
        {'For\nyou'}
      </Text>
    </Tile>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fontFamily.textSemiBold, opacity: 0.7 },
  title: { fontFamily: fontFamily.display },
});
