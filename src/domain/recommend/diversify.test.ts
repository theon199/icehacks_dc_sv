import { RANKING_CONFIG_V1 } from './config';
import { diversify, jaccard, type DiversityItem, type DiversityRules } from './diversify';
import { cuisineRegion, REGIONS, type RegionId } from '../types/cuisines';

const rules = RANKING_CONFIG_V1.diversity;

let regionCursor = 0;

/** Known cuisines keep their real region; made-up ones get a fresh region each. */
function item(
  cuisine: string,
  familyId: string,
  ingredients: string[] = [],
  region: RegionId = cuisineRegion(cuisine) ?? REGIONS[regionCursor++ % REGIONS.length]!,
): DiversityItem {
  return { cuisine, region, familyId, coreIngredientIds: ingredients };
}

function windows<T>(values: readonly T[], width: number): T[][] {
  const out: T[][] = [];
  for (let start = 0; start + width <= values.length; start++) {
    out.push(values.slice(start, start + width));
  }
  return out;
}

const inOrder = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('jaccard', () => {
  it('measures shared ingredients over all ingredients', () => {
    expect(jaccard(['a', 'b'], new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(['a'], new Set(['a']))).toBe(1);
    expect(jaccard([], new Set(['a']))).toBe(0);
    expect(jaccard(['a'], new Set())).toBe(0);
  });
});

describe('diversify', () => {
  it('keeps the ranked order when it is already varied', () => {
    const items = [item('a', '1'), item('b', '2'), item('c', '3')];
    expect(diversify(inOrder(3), items, 3, rules)).toEqual([0, 1, 2]);
  });

  it('allows at most two of one cuisine in any six consecutive cards', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => item('thai', `t${i}`)),
      ...Array.from({ length: 6 }, (_, i) => item(`other${i}`, `o${i}`)),
    ];
    const picks = diversify(inOrder(items.length), items, 8, rules);
    expect(picks).toHaveLength(8);
    const cuisines = picks.map((i) => items[i]!.cuisine);
    for (const window of windows(cuisines, 6)) {
      expect(window.filter((c) => c === 'thai').length).toBeLessThanOrEqual(2);
    }
    expect(cuisines.slice(0, 2)).toEqual(['thai', 'thai']);
  });

  it('never shows two variants of the same dish', () => {
    const items = [item('a', 'dal'), item('b', 'dal'), item('c', 'soup')];
    expect(diversify(inOrder(3), items, 3, rules)).toEqual([0, 2]);
  });

  it('skips dishes with nearly the same ingredients', () => {
    const items = [
      item('a', '1', ['rice', 'egg', 'pea', 'carrot']),
      item('b', '2', ['rice', 'egg', 'pea', 'onion']),
      item('c', '3', ['bean', 'tortilla']),
    ];
    expect(diversify(inOrder(3), items, 2, rules)).toEqual([0, 2]);
  });

  it('relaxes overlap, then the cuisine cap, to fill the deck', () => {
    const items = [
      item('thai', '1', ['rice', 'egg']),
      item('thai', '2', ['rice', 'egg']),
      item('thai', '3', ['noodle']),
    ];
    const picks = diversify(inOrder(3), items, 3, rules);
    expect(picks).toHaveLength(3);
    expect(picks[0]).toBe(0);
    expect(new Set(picks).size).toBe(3);
  });

  it('allows at most three cards from one region in any six consecutive cards', () => {
    const items = [
      item('thai', 'a'),
      item('vietnamese', 'b'),
      item('filipino', 'c'),
      item('malaysian', 'd'),
      item('indonesian', 'e'),
      item('mexican', 'f'),
      item('italian', 'g'),
      item('indian', 'h'),
      item('japanese', 'i'),
    ];
    const picks = diversify(inOrder(items.length), items, 8, rules);
    expect(picks).toHaveLength(8);
    const regions = picks.map((i) => items[i]!.region);
    for (const window of windows(regions, 6)) {
      expect(window.filter((r) => r === 'southeast_asia').length).toBeLessThanOrEqual(3);
    }
    // The fourth Southeast Asian dish waits for other regions instead of joining the head.
    expect(picks.slice(0, 4)).toEqual([0, 1, 2, 5]);
  });

  it('retries the strict rules before relaxing them', () => {
    // No two consecutive cards from one cuisine or region.
    const tight: DiversityRules = {
      cuisineCap: 1,
      regionCap: 1,
      window: 2,
      maxIngredientOverlap: 0.5,
    };
    const items = [
      item('thai', 't1', ['rice', 'egg'], 'southeast_asia'),
      item('greek', 'x', ['rice', 'egg'], 'southern_europe'),
      item('thai', 't2', ['noodle'], 'southeast_asia'),
      item('mexican', 'y', ['bean'], 'latin_america'),
    ];
    // A single pass would skip t2 (cap) and x (overlap), take y, then relax overlap and take x.
    // Rescanning at the strict level finds t2 once y has moved the window on.
    expect(diversify(inOrder(4), items, 3, tight)).toEqual([0, 3, 2]);
  });

  it('places every strictly picked card before any relaxed one', () => {
    const items = [
      item('thai', '1', ['rice', 'egg']),
      item('thai', '2', ['rice', 'egg']),
      item('mexican', '3', ['bean']),
    ];
    expect(diversify(inOrder(3), items, 3, rules)).toEqual([0, 2, 1]);
  });

  it('respects the requested size and the given order', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`c${i}`, `f${i}`));
    expect(diversify([9, 8, 7, 6], items, 2, rules)).toEqual([9, 8]);
    expect(diversify(inOrder(10), items, 0, rules)).toEqual([]);
  });
});
