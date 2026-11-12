import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INGREDIENTS } from '../src/knowledge/index.ts';
import { IngredientMatcher } from '../src/match/matcher.ts';
import { singular, tokenize } from '../src/match/normalize.ts';
import { parseMeasure } from '../src/parse/measure.ts';

const matcher = new IngredientMatcher(INGREDIENTS);
const match = (line: string) => matcher.matchLine(parseMeasure(line).rest);

describe('normalisation', () => {
  it('singularises regular and irregular plurals', () => {
    assert.equal(singular('tomatoes'), 'tomato');
    assert.equal(singular('berries'), 'berry');
    assert.equal(singular('leaves'), 'leaf');
    assert.equal(singular('peaches'), 'peach');
    assert.equal(singular('hummus'), 'hummus');
    assert.equal(singular('asparagus'), 'asparagus');
  });

  it('folds accents and punctuation', () => {
    assert.deepEqual(tokenize('Gruyère, crème-fraîche!'), ['gruyere', 'creme', 'fraiche']);
  });
});

describe('IngredientMatcher', () => {
  it('has no synonym that points at two ingredients', () => {
    assert.deepEqual(matcher.collisions, []);
  });

  it('maps spelling variants to one canonical ingredient', () => {
    for (const name of ['chickpeas', 'chick peas', 'garbanzo beans', 'Garbanzo Bean', 'can of chickpeas']) {
      assert.equal(matcher.matchLine(name).id, 'chickpea', name);
    }
    assert.equal(matcher.matchLine('courgettes').id, 'zucchini');
    assert.equal(matcher.matchLine('aubergine').id, 'eggplant');
    assert.equal(matcher.matchLine('spring onions').id, 'scallion');
  });

  it('prefers the longest phrase in a free-text line', () => {
    assert.equal(match('1/4 cup low-sodium soy sauce').id, 'low_sodium_soy_sauce');
    assert.equal(match('2 tablespoons peanut butter').id, 'peanut_butter');
    assert.equal(match('1 can (15 ounces) black beans, drained and rinsed').id, 'black_bean');
    assert.equal(match('3/4 pound lean ground beef').id, 'lean_ground_beef');
    assert.equal(match('1 cup red pepper flakes').id, 'red_pepper_flakes');
  });

  it('uses the name before the comma as the primary ingredient', () => {
    assert.equal(match('2 tomatoes, chopped').id, 'tomato');
    assert.equal(match('4 boneless, skinless chicken breasts').id, 'chicken_breast');
  });

  it('collects every ingredient a line names for safety roll-ups', () => {
    const both = matcher.matchLine('butter or margarine');
    assert.ok(both.all.includes('margarine'));
    const aside = matcher.matchLine('diced cooked protein (ham, chicken, turkey or tofu)');
    for (const id of ['ham', 'chicken', 'turkey', 'tofu']) assert.ok(aside.all.includes(id), id);
    const seasoning = matcher.matchLine('salt and pepper to taste');
    assert.ok(seasoning.all.includes('black_pepper'));
  });

  it('returns no match for lines it does not recognise', () => {
    assert.equal(matcher.matchLine('topping ingredients as you choose').id, null);
    assert.deepEqual(matcher.matchLine('mystery item').all, []);
  });
});
