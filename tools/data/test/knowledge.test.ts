import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientDefSchema } from '../src/knowledge/define.ts';
import { INGREDIENTS, INGREDIENT_BY_ID } from '../src/knowledge/index.ts';
import { SUBSTITUTIONS } from '../src/knowledge/substitutions.ts';
import { CUISINES, REGIONS } from '../src/knowledge/cuisines.ts';
import { gramsPerUnit, pluralName } from '../src/derive/ingredients.ts';
import { GOAL_TAGS } from '../src/types.ts';

describe('ingredient knowledge base', () => {
  it('validates every definition and keeps ids unique', () => {
    for (const def of INGREDIENTS) assert.ok(ingredientDefSchema.safeParse(def).success, def.id);
    assert.equal(INGREDIENT_BY_ID.size, INGREDIENTS.length);
  });

  it('pins most ingredients to a USDA food', () => {
    const pinned = INGREDIENTS.filter((d) => d.fdc !== null).length;
    assert.ok(pinned / INGREDIENTS.length > 0.95, `${pinned}/${INGREDIENTS.length}`);
  });

  it('marks common staples for the pantry starter', () => {
    for (const id of ['salt', 'black_pepper', 'olive_oil', 'flour', 'sugar', 'garlic', 'onion', 'egg']) {
      assert.equal(INGREDIENT_BY_ID.get(id)?.pantry, true, id);
    }
  });

  it('derives household weights with sensible fallbacks', () => {
    const egg = INGREDIENT_BY_ID.get('egg');
    assert.ok(egg);
    const units = gramsPerUnit(egg, []);
    assert.equal(units.large, 50);
    assert.ok((units.tbsp ?? 0) > 0 && (units.tsp ?? 0) > 0 && (units.cup ?? 0) > 0);
  });

  it('derives plural display names from listed synonyms', () => {
    const chickpea = INGREDIENT_BY_ID.get('chickpea');
    assert.ok(chickpea);
    assert.equal(pluralName(chickpea), 'chickpeas');
  });
});

describe('substitutions', () => {
  it('offers at least 100 swaps that reference known ingredients', () => {
    assert.ok(SUBSTITUTIONS.length >= 100, String(SUBSTITUTIONS.length));
    const goals = new Set<string>([...GOAL_TAGS, 'allergen', 'diet']);
    const keys = new Set<string>();
    for (const s of SUBSTITUTIONS) {
      assert.ok(INGREDIENT_BY_ID.has(s.from), s.from);
      assert.ok(INGREDIENT_BY_ID.has(s.to), s.to);
      assert.notEqual(s.from, s.to);
      assert.ok(goals.has(s.goal), s.goal);
      assert.ok(s.ratio > 0);
      assert.ok(s.note.length >= 10);
      const key = `${s.from}>${s.to}>${s.goal}`;
      assert.ok(!keys.has(key), `duplicate ${key}`);
      keys.add(key);
    }
  });

  it('includes the classic sour cream to greek yogurt swap', () => {
    assert.ok(SUBSTITUTIONS.some((s) => s.from === 'sour_cream' && s.to === 'greek_yogurt'));
  });
});

describe('cuisines', () => {
  it('uses only known regions and unique ids', () => {
    const ids = new Set<string>();
    for (const c of CUISINES) {
      assert.ok((REGIONS as readonly string[]).includes(c.region), c.id);
      assert.ok(!ids.has(c.id), c.id);
      ids.add(c.id);
    }
  });
});
