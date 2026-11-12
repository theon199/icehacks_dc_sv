import type { IngredientDef } from '../knowledge/define.ts';
import { CUISINE_BY_ID, resolveCuisine } from '../knowledge/cuisines.ts';
import { IngredientMatcher } from '../match/matcher.ts';
import { measureToGrams, parseMeasure, type Measure } from '../parse/measure.ts';
import { detectTimerSeconds, splitSteps } from '../parse/steps.ts';
import { GENERIC_UNIT_GRAMS, ingredientAllergens, pluralName } from '../derive/ingredients.ts';
import { addScaled, divide, EMPTY_NUTRITION, toNutrition, ZERO_PROFILE, type NutrientProfile } from '../derive/nutrition.ts';
import { rollupAllergens, rollupDiet, type MatchedLine } from '../derive/rollup.ts';
import {
  buildSummary,
  computeEffort,
  estimateServings,
  estimateTimes,
  familyKey,
  goalTags,
  isGentle,
  mapCourse,
} from '../derive/recipe.ts';
import { healthScore } from '../score.ts';
import type { LinkStatus } from '../sources/links.ts';
import { DietFlag, type Nutrition, type NutritionConfidence, type SourceRecipe } from '../types.ts';
import type { BuildIssue, RecipeIngredientRow, RecipeRow, RecipeTutorialRow } from './types.ts';

/** Minimum share of quantified lines whose weight and nutrients are known to report nutrition. */
export const NUTRITION_COVERAGE_MIN = 0.8;
/**
 * Sanity bounds for energy per serving; outside them nutrition is withheld rather than shown.
 * Estimated values must be at least 30 kcal. Published label values (MedlinePlus) may be as low
 * as 5 kcal, because dips, salsas and pickles legitimately have very small servings.
 */
export const KCAL_PER_SERVING_RANGE = [30, 2500] as const;
export const PUBLISHED_KCAL_MIN = 5;

export function kcalInRange(kcal: number | null, published: boolean): boolean {
  const min = published ? PUBLISHED_KCAL_MIN : KCAL_PER_SERVING_RANGE[0];
  return kcal !== null && kcal >= min && kcal <= KCAL_PER_SERVING_RANGE[1];
}
/** Salt assumed for a whole recipe when a line says "salt to taste". */
const SALT_TO_TASTE_GRAMS = 1.5;

export interface RecipeContext {
  matcher: IngredientMatcher;
  defs: ReadonlyMap<string, IngredientDef>;
  /** Per-100 g nutrient profiles for ingredients that have an FDC food. */
  profiles: ReadonlyMap<string, NutrientProfile>;
  units: ReadonlyMap<string, Record<string, number>>;
  links: ReadonlyMap<string, LinkStatus>;
}

interface ParsedLine {
  row: RecipeIngredientRow;
  measure: Measure;
  matched: MatchedLine;
  primary: IngredientDef | null;
}

const OPTIONAL = /\boptional\b/i;

function parseLine(source: SourceRecipe, index: number, ctx: RecipeContext): ParsedLine {
  const line = source.lines[index];
  if (!line) throw new Error(`missing line ${index} in ${source.id}`);
  const measure = parseMeasure(line.measure ?? line.text);
  const name = line.name ?? measure.rest;
  const match = ctx.matcher.matchLine(name);
  const matched = match.id === null ? null : match.all.map((id) => ctx.defs.get(id)).filter((d): d is IngredientDef => d !== undefined);
  const primary = match.id ? (ctx.defs.get(match.id) ?? null) : null;
  let grams: number | null = null;
  if (primary && !measure.unquantified && measure.quantity !== null) {
    grams = measureToGrams(measure, ctx.units.get(primary.id) ?? {});
    if (grams === null && measure.unit && GENERIC_UNIT_GRAMS[measure.unit] !== undefined) grams = measure.quantity * (GENERIC_UNIT_GRAMS[measure.unit] ?? 0);
  }
  return {
    row: {
      position: index + 1,
      ingredient_id: primary?.id ?? null,
      text: line.text,
      quantity: measure.quantity === null ? null : Math.round(measure.quantity * 1000) / 1000,
      unit: measure.unit,
      grams: grams === null ? null : Math.round(grams * 10) / 10,
      section: line.section ?? null,
      optional: OPTIONAL.test(line.text) ? 1 : 0,
    },
    measure,
    matched,
    primary,
  };
}

interface Totals {
  profile: NutrientProfile;
  /** Grams of food, excluding plain water and ice. */
  foodGrams: number;
  plantGrams: number;
  vegetableGrams: number;
  coverage: number;
}

function totals(lines: readonly ParsedLine[], ctx: RecipeContext): Totals {
  let profile = ZERO_PROFILE;
  let foodGrams = 0;
  let plantGrams = 0;
  let vegetableGrams = 0;
  let quantified = 0;
  let known = 0;
  let saltToTaste = false;
  for (const line of lines) {
    const def = line.primary;
    if (!def) {
      if (!line.measure.unquantified) quantified++;
      continue;
    }
    if (line.measure.unquantified || line.measure.quantity === null) {
      if (line.matched?.some((d) => d.id === 'salt' || d.id === 'seasoned_salt')) saltToTaste = true;
      continue;
    }
    quantified++;
    const grams = line.row.grams;
    const per100 = ctx.profiles.get(def.id);
    // Without FDC data only negligible amounts (wrapping leaves, colourings) count as known.
    if (grams === null || (!per100 && grams >= 5)) continue;
    known++;
    if (per100) profile = addScaled(profile, per100, grams);
    if (def.water) continue;
    foodGrams += grams;
    if (['produce', 'legume', 'grain', 'nut_seed'].includes(def.category)) plantGrams += grams;
    if (def.category === 'produce' || def.category === 'legume') vegetableGrams += grams;
  }
  if (saltToTaste) {
    const salt = ctx.profiles.get('salt');
    if (salt) profile = addScaled(profile, salt, SALT_TO_TASTE_GRAMS);
  }
  return { profile, foodGrams, plantGrams, vegetableGrams, coverage: quantified === 0 ? 0 : known / quantified };
}

/** Supporting ingredients that rarely define a dish unless its title names them. */
const SUPPORTING = new Set([
  'garlic', 'onion', 'ginger', 'lemon_juice', 'lime_juice', 'parsley', 'cilantro', 'butter', 'unsalted_butter', 'ghee', 'margarine',
  'milk', 'low_fat_milk', 'skim_milk', 'egg', 'egg_white', 'egg_yolk', 'flour', 'bread_flour', 'self_raising_flour',
  'whole_wheat_flour', 'cornstarch', 'potato_starch', 'tapioca', 'breadcrumbs', 'cornmeal', 'rice_flour', 'scallion', 'chili_pepper',
]);

/** Up to three ingredients for the summary: those the title names first, then the heaviest. */
function keyIngredients(title: string, lines: readonly ParsedLine[], ctx: RecipeContext): string[] {
  const named = new Set(ctx.matcher.findAll(title).map((m) => m.id));
  const foods = lines.filter((l) => {
    const def = l.primary;
    return def !== null && !def.water && ['produce', 'protein', 'legume', 'grain', 'dairy', 'nut_seed', 'sweetener'].includes(def.category);
  });
  const featured = foods.filter((l) => l.primary && l.primary.category !== 'sweetener' && (named.has(l.primary.id) || !SUPPORTING.has(l.primary.id)));
  const candidates = featured.length > 0 ? featured : foods;
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(named.has(b.primary?.id ?? '')) - Number(named.has(a.primary?.id ?? '')) ||
      (b.row.grams ?? 0) - (a.row.grams ?? 0) ||
      a.row.position - b.row.position,
  );
  const names: string[] = [];
  for (const line of ranked) {
    const name = line.primary ? (pluralName(line.primary) ?? line.primary.name).toLowerCase() : '';
    if (name && !names.includes(name)) names.push(name);
    if (names.length === 3) break;
  }
  return names;
}

const PLANT_BASED_TITLE = /\b(vegan|vegetarian|veggie|meatless|plant[- ]based|mock|faux|eggless|dairy[- ]free|egg[- ]free|nut[- ]free|gluten[- ]free)\b/i;
/** Title phrases that name a food without the dish containing it. */
const TITLE_NOISE = /\b(?:(?:without|no|minus)\s+\w+(?:\s+\w+)?|(?:cauliflower|cabbage|mushroom|portobello|tofu|celeriac|eggplant|aubergine|squash|tomato|beet|beetroot)\s+steaks?)\b/gi;
const TITLE_CATEGORIES = new Set(['protein', 'dairy', 'nut_seed']);

/**
 * Proteins, dairy, nuts and seeds a title names ("Saltfish", "Pork Belly", "Peanut Soup") whose
 * diet or allergen effect is missing from the ingredient list. Baked goods and sauces in titles
 * ("Banana Bread", "Teriyaki ...") describe the dish, not an ingredient, so they are ignored.
 */
function titleIngredients(title: string, lines: readonly ParsedLine[], ctx: RecipeContext): IngredientDef[] {
  if (PLANT_BASED_TITLE.test(title)) return [];
  const present = lines.flatMap((l) => l.matched ?? []);
  const meats = new Set(present.flatMap((d) => (d.meat ? [d.meat] : [])));
  const allergens = new Set(present.flatMap((d) => ingredientAllergens(d)));
  const out: IngredientDef[] = [];
  for (const match of ctx.matcher.findAll(title.replace(TITLE_NOISE, ' '))) {
    const def = ctx.defs.get(match.id);
    if (!def || !TITLE_CATEGORIES.has(def.category)) continue;
    const newMeat = def.meat !== null && !meats.has(def.meat);
    const newAllergen = ingredientAllergens(def).some((a) => !allergens.has(a));
    if ((newMeat || newAllergen) && !out.includes(def)) out.push(def);
  }
  return out;
}

function tutorials(source: SourceRecipe, ctx: RecipeContext, issues: BuildIssue[]): RecipeTutorialRow[] {
  const out = new Map<string, RecipeTutorialRow>();
  for (const t of source.tutorials) {
    const status = ctx.links.get(t.url);
    if (status?.dead) {
      issues.push({ recipe_id: source.id, kind: 'tutorial_dropped', detail: `${t.url} (HTTP ${status.status})` });
      continue;
    }
    const title = t.title ?? status?.title ?? null;
    if (!out.has(t.url)) out.set(t.url, { kind: t.kind, url: t.url, title, publisher: t.publisher });
  }
  return [...out.values()];
}

/** Derives every Famara field for one source recipe. Returns null when it cannot be shipped. */
export function buildRecipe(source: SourceRecipe, ctx: RecipeContext, issues: BuildIssue[]): Omit<RecipeRow, 'slug'> | null {
  const lines = source.lines.map((_, i) => parseLine(source, i, ctx));
  const steps = splitSteps(source.instructions);
  if (lines.length === 0 || steps.length === 0) {
    issues.push({ recipe_id: source.id, kind: 'excluded', detail: lines.length === 0 ? 'no ingredient lines' : 'no instructions' });
    return null;
  }
  for (const line of lines) {
    if (line.matched === null) issues.push({ recipe_id: source.id, kind: 'unmatched_line', detail: line.row.text });
  }
  const stepRows = steps.map((text, i) => ({ position: i + 1, text, timer_seconds: detectTimerSeconds(text) }));
  const course = mapCourse(source.source, source.categories, source.title);
  const fallbackCuisine = source.source === 'medlineplus' ? 'american' : 'international';
  const { cuisine, region } = resolveCuisine(source.area, source.title, fallbackCuisine);
  const cuisineDef = CUISINE_BY_ID.get(cuisine);

  const sums = totals(lines, ctx);
  const covered = sums.coverage >= NUTRITION_COVERAGE_MIN && sums.profile.kcal > 0;

  // Servings
  let servings =
    source.servings ??
    estimateServings(course, sums.foodGrams > 0 ? sums.foodGrams : null, covered ? sums.profile.kcal : null, covered ? sums.profile.protein_g : null);
  servings = Math.max(1, Math.round(servings));

  // Nutrition per serving
  let nutrition: Nutrition = EMPTY_NUTRITION;
  let confidence: NutritionConfidence = 'none';
  const computed = covered ? toNutrition(divide(sums.profile, servings)) : null;
  if (source.publishedNutrition) {
    nutrition = { ...source.publishedNutrition };
    if (nutrition.added_sugar_g === null && computed) nutrition.added_sugar_g = computed.added_sugar_g;
    confidence = 'computed';
  } else if (computed) {
    nutrition = computed;
    confidence = source.servings !== null ? 'computed' : 'estimated';
  }
  if (confidence !== 'none' && !kcalInRange(nutrition.kcal, source.publishedNutrition !== null)) {
    issues.push({ recipe_id: source.id, kind: 'nutrition_withheld', detail: `kcal/serving ${nutrition.kcal} outside ${KCAL_PER_SERVING_RANGE.join('..')}` });
    nutrition = EMPTY_NUTRITION;
    confidence = 'none';
  } else if (confidence === 'none') {
    issues.push({ recipe_id: source.id, kind: 'nutrition_withheld', detail: `coverage ${(sums.coverage * 100).toFixed(0)}%` });
  }

  // Time and effort
  const estimate = estimateTimes(lines.length, stepRows.map((s) => s.timer_seconds), course);
  const total = source.totalMinutes ?? (source.prepMinutes !== null && source.cookMinutes !== null ? source.prepMinutes + source.cookMinutes : estimate.total);
  const active = Math.min(total, source.prepMinutes ?? estimate.active);
  const effort = computeEffort(lines.length, steps, active);

  // Safety and goals. A dish named after a food that its ingredient list omits ("... pork
  // belly" with no pork line) still counts that food, so diet and allergen claims stay safe.
  const matchedLines: MatchedLine[] = lines.map((l) => l.matched);
  const titleExtras = titleIngredients(source.title, lines, ctx);
  if (titleExtras.length > 0) {
    matchedLines.push(titleExtras);
    issues.push({ recipe_id: source.id, kind: 'title_ingredient_missing', detail: titleExtras.map((d) => d.id).join(', ') });
  }
  const allergens = rollupAllergens(matchedLines);
  const dietFlags = rollupDiet(matchedLines, allergens);
  const servingGrams = sums.foodGrams > 0 ? sums.foodGrams / servings : null;
  const plantShare = sums.foodGrams > 0 ? sums.plantGrams / sums.foodGrams : null;
  const vegetableShare = sums.foodGrams > 0 ? sums.vegetableGrams / sums.foodGrams : null;
  const shownNutrition = confidence === 'none' ? null : nutrition;
  const goals = goalTags({
    nutrition: shownNutrition,
    servingGrams,
    course,
    vegetarian: (dietFlags & DietFlag.vegetarian) !== 0,
    vegan: (dietFlags & DietFlag.vegan) !== 0,
    plantShare,
  });
  const ingredientIds = lines.flatMap((l) => (l.primary ? [l.primary.id] : []));
  const gentle = isGentle({
    course,
    kcal: shownNutrition?.kcal ?? null,
    sodiumMg: shownNutrition?.sodium_mg ?? null,
    totalMinutes: total,
    effort,
    title: source.title,
    steps,
    ingredientIds,
  });
  const score = healthScore({ ...nutrition, vegetableShare });

  const summary = buildSummary({
    cuisineLabel: cuisine === 'international' ? null : (cuisineDef?.label ?? null),
    course,
    keyIngredients: keyIngredients(source.title, lines, ctx),
    totalMinutes: total,
    nutrition: shownNutrition,
    goals,
  });

  const searchNames = [...new Set(lines.flatMap((l) => (l.primary ? [l.primary.name] : [])))].join(' ');
  return {
    id: source.id,
    title: source.title,
    summary,
    cuisine,
    cuisine_label: cuisineDef?.label ?? cuisine,
    region,
    course,
    total_minutes: total,
    active_minutes: active,
    servings,
    effort,
    image_url: source.imageUrl,
    image_credit: source.imageCredit,
    source_name: source.sourceName,
    source_url: source.sourceUrl,
    license: source.license,
    nutrition,
    nutrition_confidence: confidence,
    allergens,
    diet_flags: dietFlags,
    goal_tags: goals,
    gentle: gentle ? 1 : 0,
    health_score: score,
    family_id: `fam:${familyKey(source.title)}`,
    ingredients: lines.map((l) => l.row),
    steps: stepRows,
    tutorials: tutorials(source, ctx, issues),
    search_ingredients: searchNames,
  };
}
