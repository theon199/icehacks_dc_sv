import { ingredientDefSchema, type IngredientDef } from '../knowledge/define.ts';
import { CUISINE_BY_ID, REGIONS } from '../knowledge/cuisines.ts';
import type { SubstitutionDef } from '../knowledge/substitutions.ts';
import { compoundAliasGaps } from '../match/audit.ts';
import type { IngredientMatcher } from '../match/matcher.ts';
import type { FdcFood } from '../sources/fdc.ts';
import { ALL_DIET_FLAGS, ALLERGEN_IDS, COURSES, GOAL_TAGS, NUTRITION_CONFIDENCE } from '../types.ts';
import { kcalInRange } from './recipes.ts';
import type { RecipeRow } from './types.ts';

export const MIN_MATCH_RATE = 0.98;
export const MAX_DB_BYTES = 15 * 1024 * 1024;

export class GateReport {
  readonly violations: string[] = [];
  private checks = 0;

  check(condition: boolean, message: () => string): void {
    this.checks++;
    if (!condition) this.violations.push(message());
  }

  get checkCount(): number {
    return this.checks;
  }
}

export function checkKnowledge(
  gates: GateReport,
  defs: readonly IngredientDef[],
  matcher: IngredientMatcher,
  substitutions: readonly SubstitutionDef[],
  foods: ReadonlyMap<number, FdcFood>,
): void {
  const ids = new Set<string>();
  for (const def of defs) {
    const parsed = ingredientDefSchema.safeParse(def);
    gates.check(parsed.success, () => `ingredient ${def.id}: invalid definition ${parsed.error?.message ?? ''}`);
    gates.check(!ids.has(def.id), () => `ingredient ${def.id}: duplicate id`);
    ids.add(def.id);
    if (def.fdc) {
      const [fdcId, description] = def.fdc;
      const food = foods.get(fdcId);
      gates.check(food !== undefined, () => `ingredient ${def.id}: FDC ${fdcId} not found`);
      gates.check(!food || food.description === description, () => `ingredient ${def.id}: FDC ${fdcId} is "${food?.description}", table says "${description}"`);
    }
  }
  for (const def of defs) {
    const prepared = def.preparedAs;
    if (prepared !== null) gates.check(ids.has(prepared), () => `ingredient ${def.id}: preparedAs ${prepared} is not an ingredient`);
  }
  for (const gap of compoundAliasGaps(defs, matcher)) {
    gates.check(false, () => `ingredient ${gap.id}: synonym "${gap.synonym}" hides "${gap.alternative}" (${gap.via}) and ${gap.reason}`);
  }
  for (const collision of matcher.collisions) {
    gates.check(false, () => `synonym "${collision.key}" maps to both ${collision.ids[0]} and ${collision.ids[1]}`);
  }
  const keys = new Set<string>();
  for (const s of substitutions) {
    const key = `${s.from}>${s.to}>${s.goal}`;
    gates.check(ids.has(s.from), () => `substitution ${key}: unknown from_id`);
    gates.check(ids.has(s.to), () => `substitution ${key}: unknown to_id`);
    gates.check(s.from !== s.to, () => `substitution ${key}: swaps an ingredient for itself`);
    gates.check(s.ratio > 0 && s.ratio <= 4, () => `substitution ${key}: ratio ${s.ratio} out of range`);
    gates.check(s.note.trim().length >= 10, () => `substitution ${key}: note too short`);
    gates.check(!keys.has(key), () => `substitution ${key}: duplicate`);
    keys.add(key);
  }
}

const isHttps = (value: string) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export function checkRecipes(gates: GateReport, recipes: readonly RecipeRow[], ingredientIds: ReadonlySet<string>): void {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const r of recipes) {
    const at = `recipe ${r.id}`;
    gates.check(!ids.has(r.id), () => `${at}: duplicate id`);
    gates.check(!slugs.has(r.slug), () => `${at}: duplicate slug ${r.slug}`);
    ids.add(r.id);
    slugs.add(r.slug);
    gates.check(/^(mealdb|medlineplus):[a-z0-9-]+$/.test(r.id), () => `${at}: malformed id`);
    gates.check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.slug), () => `${at}: malformed slug ${r.slug}`);
    gates.check(r.title.trim().length > 0, () => `${at}: empty title`);
    gates.check(r.ingredients.length >= 1, () => `${at}: no ingredients`);
    gates.check(r.steps.length >= 1, () => `${at}: no steps`);
    gates.check(r.steps.every((s) => s.text.trim().length > 0), () => `${at}: empty step`);
    gates.check((COURSES as readonly string[]).includes(r.course), () => `${at}: bad course ${r.course}`);
    gates.check(CUISINE_BY_ID.has(r.cuisine), () => `${at}: unknown cuisine ${r.cuisine}`);
    gates.check((REGIONS as readonly string[]).includes(r.region), () => `${at}: bad region ${r.region}`);
    gates.check((NUTRITION_CONFIDENCE as readonly string[]).includes(r.nutrition_confidence), () => `${at}: bad confidence`);
    gates.check(r.goal_tags.every((g) => (GOAL_TAGS as readonly string[]).includes(g)), () => `${at}: bad goal tag`);
    gates.check(Number.isInteger(r.servings) && r.servings >= 1 && r.servings <= 48, () => `${at}: servings ${r.servings}`);
    gates.check(r.effort >= 1 && r.effort <= 3, () => `${at}: effort ${r.effort}`);
    gates.check(r.total_minutes > 0 && r.active_minutes > 0 && r.active_minutes <= r.total_minutes, () => `${at}: times ${r.active_minutes}/${r.total_minutes}`);
    gates.check(r.health_score >= 0 && r.health_score <= 1, () => `${at}: health score ${r.health_score}`);
    gates.check((r.diet_flags & ~ALL_DIET_FLAGS) === 0, () => `${at}: unknown diet bits`);
    gates.check(r.summary.length >= 20 && r.summary.length <= 300 && (r.summary.match(/[.!?](\s|$)/g)?.length ?? 0) <= 2, () => `${at}: summary "${r.summary}"`);
    gates.check(r.family_id.startsWith('fam:') && r.family_id.length > 4, () => `${at}: family id`);
    gates.check(r.image_url === null || isHttps(r.image_url), () => `${at}: image url`);
    gates.check(r.source_name.length > 0 && r.license.length > 0, () => `${at}: missing attribution`);
    for (const allergen of ALLERGEN_IDS) {
      const state = r.allergens[allergen];
      gates.check(state === 'contains' || state === 'free' || state === 'unknown', () => `${at}: allergen ${allergen}=${state}`);
    }
    const unmatched = r.ingredients.some((i) => i.ingredient_id === null);
    gates.check(!unmatched || ALLERGEN_IDS.every((a) => r.allergens[a] !== 'free'), () => `${at}: unmatched line but an allergen is "free"`);
    gates.check(!unmatched || r.diet_flags === 0, () => `${at}: unmatched line but diet flags set`);
    for (const line of r.ingredients) {
      gates.check(line.ingredient_id === null || ingredientIds.has(line.ingredient_id), () => `${at}: unknown ingredient ${line.ingredient_id}`);
      gates.check(line.text.trim().length > 0, () => `${at}: empty ingredient text`);
      gates.check(line.grams === null || (line.grams >= 0 && line.grams <= 20000), () => `${at}: line grams ${line.grams} for "${line.text}"`);
    }
    for (const t of r.tutorials) {
      gates.check(isHttps(t.url) || t.url.startsWith('http://'), () => `${at}: tutorial url ${t.url}`);
      gates.check(t.kind === 'video' || t.kind === 'web', () => `${at}: tutorial kind`);
    }
    const n = r.nutrition;
    if (r.nutrition_confidence === 'none') {
      gates.check(n.kcal === null, () => `${at}: nutrition values without confidence`);
    } else {
      gates.check(kcalInRange(n.kcal, r.source_name.startsWith('MedlinePlus')), () => `${at}: kcal ${n.kcal}`);
      const values = [n.protein_g, n.carbs_g, n.fat_g, n.sat_fat_g, n.fiber_g, n.sugar_g, n.added_sugar_g, n.sodium_mg];
      gates.check(values.every((v) => v === null || (Number.isFinite(v) && v >= 0)), () => `${at}: negative nutrient`);
      gates.check(n.sat_fat_g === null || n.fat_g === null || n.sat_fat_g <= n.fat_g + 0.5, () => `${at}: sat fat > fat`);
      gates.check(n.sodium_mg === null || n.sodium_mg <= 8000, () => `${at}: sodium ${n.sodium_mg}`);
      gates.check(n.protein_g === null || n.protein_g * 4 <= (n.kcal ?? 0) * 1.1 + 10, () => `${at}: protein energy exceeds kcal`);
    }
  }
}

export function checkMatchRate(gates: GateReport, matched: number, total: number): void {
  const rate = total === 0 ? 0 : matched / total;
  gates.check(rate >= MIN_MATCH_RATE, () => `ingredient match rate ${(rate * 100).toFixed(2)}% < ${MIN_MATCH_RATE * 100}%`);
}
