import type { MealTimePick } from '@/domain';
import { toDomainRecipe } from '@/lib/catalog';

import {
  allInLabel,
  metaLine,
  namedIngredientIds,
  pickAccessibilityLabel,
  statusLabel,
  whyLine,
} from './mealText';
import { candidate } from './test/fixtures';

function pick(
  ownedIds: string[],
  missingIds: string[],
  overrides: Parameters<typeof candidate>[1] = {},
): MealTimePick {
  const recipe = toDomainRecipe(
    candidate('t:matar', {
      title: 'Matar paneer',
      coreIngredientIds: [...ownedIds, ...missingIds],
      ...overrides,
    }),
  );
  const coverage = ownedIds.length / (ownedIds.length + missingIds.length);
  return { recipe, ownedIds, missingIds, coverage, fitScore: 80, score: coverage };
}

const names = new Map([
  ['paneer', 'paneer'],
  ['pea', 'peas'],
  ['tomato', 'tomatoes'],
  ['rolled_oats', 'rolled oats'],
]);

describe('metaLine', () => {
  it('reads cuisine, time and protein', () => {
    expect(metaLine(pick(['paneer'], []).recipe)).toBe('Indian · 30 min · 23g protein');
  });

  it('marks estimated protein and leaves out what the recipe does not carry', () => {
    const estimated = pick(['paneer'], [], { nutritionConfidence: 'estimated' }).recipe;
    expect(metaLine(estimated)).toBe('Indian · 30 min · Est. 23g protein');
    const bare = pick(['paneer'], [], {
      totalMinutes: null,
      nutritionConfidence: 'none',
      nutrition: null,
    }).recipe;
    expect(metaLine(bare)).toBe('Indian');
  });
});

describe('statusLabel', () => {
  it('says everything is on hand', () => {
    expect(statusLabel(pick(['paneer', 'pea'], []), names)).toBe('You have all 2');
    expect(allInLabel(pick(['paneer', 'pea'], []))).toBe('All 2 in');
  });

  it('names the first thing to buy and counts the rest', () => {
    expect(statusLabel(pick(['paneer'], ['rolled_oats']), names)).toBe('Need rolled oats');
    expect(statusLabel(pick(['paneer'], ['rolled_oats', 'x']), names)).toBe(
      'Need rolled oats and 1 more',
    );
  });

  it('counts when the name is not known yet', () => {
    expect(statusLabel(pick(['paneer'], ['x', 'y']), new Map())).toBe('Need 2 more');
  });
});

describe('whyLine', () => {
  it('names what the fridge really has', () => {
    expect(whyLine(pick(['paneer', 'pea'], []), names)).toBe('Uses the paneer and peas you have');
    expect(whyLine(pick(['paneer'], ['x']), names)).toBe('Uses the paneer you have');
  });

  it('names two and counts the rest', () => {
    expect(whyLine(pick(['paneer', 'pea', 'tomato', 'x'], []), names)).toBe(
      'Uses the paneer, peas and 2 more you have',
    );
  });

  it('counts until the names load', () => {
    expect(whyLine(pick(['paneer', 'pea'], []), new Map())).toBe('Uses 2 things you have');
    expect(whyLine(pick(['paneer'], []), new Map())).toBe('Uses 1 thing you have');
  });
});

describe('pickAccessibilityLabel', () => {
  it('reads a card with its tag and why line, and a row with its status', () => {
    const full = pick(['paneer', 'pea'], []);
    expect(pickAccessibilityLabel(full, names, 'why')).toBe(
      'Matar paneer. Indian · 30 min · 23g protein. All 2 ingredients in. Uses the paneer and peas you have',
    );
    expect(pickAccessibilityLabel(pick(['paneer'], ['rolled_oats']), names, 'status')).toBe(
      'Matar paneer. Indian · 30 min · 23g protein. Need rolled oats',
    );
  });
});

describe('namedIngredientIds', () => {
  it('asks for the named owned ingredients of top picks and the first gap of every pick', () => {
    const picks = [pick(['paneer', 'pea', 'tomato'], ['x']), pick(['tomato'], ['rolled_oats'])];
    expect(namedIngredientIds(picks, 1)).toEqual(['paneer', 'pea', 'rolled_oats', 'x']);
  });
});
