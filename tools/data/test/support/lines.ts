/** Shared helpers for tests that match ingredient lines the way the build pipeline does. */
import assert from 'node:assert/strict';
import type { MatchedLine } from '../../src/derive/rollup.ts';
import type { IngredientDef } from '../../src/knowledge/define.ts';
import { INGREDIENT_BY_ID, INGREDIENTS } from '../../src/knowledge/index.ts';
import { IngredientMatcher, type LineMatch } from '../../src/match/matcher.ts';
import { parseMeasure } from '../../src/parse/measure.ts';

export const matcher = new IngredientMatcher(INGREDIENTS);

/** Matches a full ingredient line (amount included). */
export const matchText = (text: string): LineMatch => matcher.matchLine(parseMeasure(text).rest);

export const def = (id: string): IngredientDef => {
  const found = INGREDIENT_BY_ID.get(id);
  assert.ok(found, `missing ingredient ${id}`);
  return found;
};

/**
 * Matches a line for the roll-ups exactly as the pipeline does: every ingredient the line names, and
 * the unidentified choices too, so a partly identified line never counts as complete.
 */
export const matchedLine = (text: string): MatchedLine => {
  const result = matchText(text);
  if (result.id === null) return null;
  const defs = result.all.map(def);
  return result.unresolved.length > 0 ? { defs, unresolved: result.unresolved } : defs;
};

/** The known ingredients of a matched line, whether or not it lists an unidentified choice. */
export const defsOf = (line: MatchedLine): readonly IngredientDef[] => (line === null ? [] : 'defs' in line ? line.defs : line);
