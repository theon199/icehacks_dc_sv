import { RANKING_CONFIG_V1 } from './config';
import { diversify, jaccard, type DiversityItem } from './diversify';

const rules = RANKING_CONFIG_V1.diversity;

function item(cuisine: string, familyId: string, ingredients: string[] = []): DiversityItem {
  return { cuisine, familyId, coreIngredientIds: ingredients };
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
    for (let start = 0; start + 6 <= cuisines.length; start++) {
      const window = cuisines.slice(start, start + 6);
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

  it('respects the requested size and the given order', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`c${i}`, `f${i}`));
    expect(diversify([9, 8, 7, 6], items, 2, rules)).toEqual([9, 8]);
    expect(diversify(inOrder(10), items, 0, rules)).toEqual([]);
  });
});
