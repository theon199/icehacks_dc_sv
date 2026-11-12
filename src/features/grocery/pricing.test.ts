import { buildShoppingList, estimateListCost, type ShoppingItem } from '@/domain/shopping';
import type { IngredientPrice } from '@/lib/api/commerce';

import {
  buildCostDisplay,
  buildSourceRows,
  idsToBuy,
  ingredientIdOfKey,
  isOptionalWithoutAmount,
  itemsToCost,
  retailerSummary,
  safeLink,
  toPriceRecord,
  toPriceRecords,
  UNKNOWN_RETAILER,
} from './pricing';
import { answer, PANCAKE_LINES, priced, SHOPPING_INGREDIENTS } from './testing';

function pancakeList(plannedServings = 4) {
  return buildShoppingList({
    recipes: [{ recipeId: 'r', servings: 4, plannedServings, ingredients: PANCAKE_LINES }],
    ingredients: SHOPPING_INGREDIENTS,
  });
}

function estimateFor(
  prices: Record<string, IngredientPrice>,
  items: readonly ShoppingItem[] = pancakeList().items,
  inPantry: readonly ShoppingItem[] = [],
) {
  return estimateListCost({
    items,
    inPantry,
    ingredients: SHOPPING_INGREDIENTS,
    prices: toPriceRecords(prices),
  });
}

// 500 g of a 1 kg $4.00 bag = $2.00; 3 of a dozen $3.60 eggs = $0.90.
const FLOUR = priced('flour', 400, 1, 'kg', { retailer: 'Corner Market' });
const EGGS = priced('egg', 360, 1, 'dozen', { retailer: 'Green Grocer' });

describe('toPriceRecord', () => {
  it('converts cents to dollars and keeps the package size', () => {
    expect(toPriceRecord(FLOUR)).toEqual({
      price: 4,
      packageQty: 1,
      unit: 'kg',
      source: 'Corner Market',
      fetchedAt: '2026-11-03T15:00:00.000Z',
    });
  });

  it('turns dozens and counts into single items', () => {
    expect(toPriceRecord(EGGS)).toMatchObject({ packageQty: 12, unit: 'each' });
    expect(toPriceRecord(priced('lime', 200, 6, 'count'))).toMatchObject({
      packageQty: 6,
      unit: 'each',
    });
  });

  it('assumes one unit when the package size is missing and names unnamed stores', () => {
    expect(toPriceRecord(priced('lime', 50, null, 'each', { retailer: '  ' }))).toMatchObject({
      packageQty: 1,
      source: UNKNOWN_RETAILER,
    });
  });

  it('has no record for answers without a usable price', () => {
    expect(toPriceRecord(answer('flour', 'pending'))).toBeNull();
    expect(toPriceRecord(answer('flour', 'not_found'))).toBeNull();
    expect(toPriceRecord({ ...FLOUR, unit: null })).toBeNull();
    expect(toPriceRecord({ ...FLOUR, priceCents: null })).toBeNull();
  });
});

describe('buildCostDisplay', () => {
  it('totals the package share of priced items and splits it per serving', () => {
    const estimate = estimateFor({ flour: FLOUR, egg: EGGS });
    const display = buildCostDisplay({
      estimate,
      servings: 4,
      prices: { flour: FLOUR, egg: EGGS },
    });
    expect(display.totalCents).toBe(290);
    // 290 / 4 = 72.5, rounded half up.
    expect(display.perServingCents).toBe(73);
    expect(display.wholePackageCents).toBe(760);
    expect(display.pricedCount).toBe(2);
    expect(display.hasEstimate).toBe(true);
  });

  it('scales with the servings costed', () => {
    const estimate = estimateFor({ flour: FLOUR, egg: EGGS }, pancakeList(8).items);
    const display = buildCostDisplay({
      estimate,
      servings: 8,
      prices: { flour: FLOUR, egg: EGGS },
    });
    // 1 kg flour = $4.00, 6 eggs = $1.80.
    expect(display.totalCents).toBe(580);
    expect(display.perServingCents).toBe(73);
  });

  it('shows no per-serving figure without servings or without any price', () => {
    const estimate = estimateFor({ flour: FLOUR });
    expect(buildCostDisplay({ estimate, prices: { flour: FLOUR } }).perServingCents).toBeNull();
    expect(
      buildCostDisplay({ estimate, servings: 0, prices: { flour: FLOUR } }).perServingCents,
    ).toBeNull();
    const none = buildCostDisplay({ estimate: estimateFor({}), servings: 4, prices: {} });
    expect(none.hasEstimate).toBe(false);
    expect(none.perServingCents).toBeNull();
    expect(none.totalCents).toBe(0);
  });

  it('explains every item left out of the total', () => {
    const prices = {
      flour: FLOUR,
      egg: answer('egg', 'pending'),
      tahini: answer('tahini', 'not_found'),
    };
    const display = buildCostDisplay({ estimate: estimateFor(prices), servings: 4, prices });
    expect(display.totalCents).toBe(200);
    expect(display.checking.map((m) => [m.key, m.reason])).toEqual([['i:egg', 'checking']]);
    expect(display.missing.map((m) => [m.name, m.reason])).toEqual(
      expect.arrayContaining([
        ['tahini', 'no_price'],
        ['fresh parsley', 'no_price'],
      ]),
    );
    expect(display.complete).toBe(false);
  });

  it('treats unanswered items as checking until lookups stop', () => {
    const estimate = estimateFor({ flour: FLOUR });
    const running = buildCostDisplay({ estimate, prices: { flour: FLOUR } });
    expect(running.checking.map((m) => m.key).sort()).toEqual(['i:egg', 'i:tahini']);
    const stopped = buildCostDisplay({ estimate, prices: { flour: FLOUR }, lookupStopped: true });
    expect(stopped.checking).toEqual([]);
    expect(stopped.missing.filter((m) => m.reason === 'unavailable').map((m) => m.key)).toEqual(
      expect.arrayContaining(['i:egg', 'i:tahini']),
    );
  });

  it('reports server-side unavailable answers and unmatched units', () => {
    const prices = {
      flour: priced('flour', 300, 1, 'bunch'),
      egg: answer('egg', 'unavailable'),
    };
    const display = buildCostDisplay({ estimate: estimateFor(prices), prices });
    const reasons = Object.fromEntries(display.missing.map((m) => [m.key, m.reason]));
    expect(reasons['i:flour']).toBe('not_comparable');
    expect(reasons['i:egg']).toBe('unavailable');
  });

  it('is complete when every item to buy has a price', () => {
    const items = pancakeList().items.filter((i) => i.key === 'i:flour' || i.key === 'i:salt');
    const display = buildCostDisplay({
      estimate: estimateFor({ flour: FLOUR }, items),
      servings: 2,
      prices: { flour: FLOUR },
    });
    expect(display.complete).toBe(true);
    expect(display.missing).toEqual([]);
    expect(display.toBuyCount).toBe(1);
  });

  it('knows when there is nothing to buy', () => {
    const list = pancakeList();
    const salt = list.items.filter((i) => i.key === 'i:salt');
    const flourAtHome = list.items
      .filter((i) => i.key === 'i:flour')
      .map((i) => ({ ...i, pantry: 'covered' as const }));
    const display = buildCostDisplay({
      estimate: estimateFor({ flour: FLOUR }, salt, flourAtHome),
      prices: { flour: FLOUR },
    });
    expect(display.nothingToBuy).toBe(true);
    expect(display.empty).toBe(false);
    expect(display.totalCents).toBe(0);
    expect(display.hasEstimate).toBe(false);
  });

  it('calls a list with no items empty rather than already at home', () => {
    const display = buildCostDisplay({ estimate: estimateFor({}, [], []), prices: {} });
    expect(display.empty).toBe(true);
    expect(display.nothingToBuy).toBe(false);
    expect(display.toBuyCount).toBe(0);
  });

  it('does not count optional items without an amount as items to buy', () => {
    const list = buildShoppingList({
      recipes: [
        {
          recipeId: 'r',
          servings: 4,
          plannedServings: 4,
          ingredients: [
            ...PANCAKE_LINES,
            {
              ingredient_id: 'milk',
              text: 'milk to serve',
              quantity: null,
              unit: null,
              optional: true,
            },
          ],
        },
      ],
      ingredients: SHOPPING_INGREDIENTS,
    });
    const items = itemsToCost(list.items);
    const display = buildCostDisplay({
      estimate: estimateFor({ flour: FLOUR, egg: EGGS }, items),
      prices: { flour: FLOUR, egg: EGGS },
    });
    // flour, egg, tahini and the unmatched parsley; not the optional milk.
    expect(display.toBuyCount).toBe(4);
    expect(display.missing.map((m) => m.key)).not.toContain('i:milk');
    expect(display.checking.map((m) => m.key)).toEqual(['i:tahini']);
  });
});

describe('sources', () => {
  it('lists each priced item with its store, link, date and share, by name', () => {
    const prices = { flour: FLOUR, egg: { ...EGGS, confidence: 'estimated' as const } };
    const rows = buildSourceRows(estimateFor(prices), prices, { flour: 'Flour', egg: 'Egg' });
    expect(rows.map((r) => r.name)).toEqual(['Egg', 'Flour']);
    expect(rows[0]).toMatchObject({
      ingredientId: 'egg',
      retailer: 'Green Grocer',
      url: 'https://shop.example.com/p/egg',
      priceCents: 360,
      fetchedAt: '2026-11-03T15:00:00.000Z',
      estimated: true,
      shareCents: 90,
    });
    expect(rows[1]).toMatchObject({ estimated: false, shareCents: 200 });
  });

  it('drops links that are not plain https pages', () => {
    expect(safeLink('https://shop.example.com/item?id=3')).toBe(
      'https://shop.example.com/item?id=3',
    );
    expect(safeLink('  https://shop.example.com  ')).toBe('https://shop.example.com');
    expect(safeLink('http://shop.example.com/item')).toBeNull();
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('https://user@evil.example.com')).toBeNull();
    expect(safeLink('https://localhost/item')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });

  it('summarises stores by how many prices each gave', () => {
    const prices = { flour: FLOUR, egg: EGGS, tahini: priced('tahini', 600, 16, 'oz') };
    const rows = buildSourceRows(estimateFor(prices), prices, {});
    expect(retailerSummary(rows)).toEqual(['Corner Market', 'Green Grocer']);
  });
});

describe('ids', () => {
  it('reads ingredient ids from item keys', () => {
    expect(ingredientIdOfKey('i:flour')).toBe('flour');
    expect(ingredientIdOfKey('t:fresh parsley')).toBeNull();
    expect(ingredientIdOfKey('i:')).toBeNull();
  });

  it('skips optional items that have no amount', () => {
    const list = pancakeList();
    const flour = list.items.find((i) => i.key === 'i:flour');
    const egg = list.items.find((i) => i.key === 'i:egg');
    if (!flour || !egg) throw new Error('fixture');
    const garnish = { ...flour, key: 'i:milk', ingredientId: 'milk', optional: true, amounts: [] };
    const optionalWithAmount = { ...egg, optional: true };
    expect(isOptionalWithoutAmount(garnish)).toBe(true);
    expect(isOptionalWithoutAmount(optionalWithAmount)).toBe(false);
    expect(idsToBuy([garnish, optionalWithAmount])).toEqual(['egg']);
    expect(itemsToCost([garnish, optionalWithAmount])).toEqual([optionalWithAmount]);
    const unchanged = [optionalWithAmount];
    expect(itemsToCost(unchanged)).toBe(unchanged);
  });

  it('asks prices only for items that must be bought', () => {
    const list = pancakeList();
    const items = list.items.map((i) =>
      i.key === 'i:egg' ? { ...i, pantry: 'covered' as const } : i,
    );
    expect(idsToBuy(items)).toEqual(['flour', 'tahini']);
  });
});
