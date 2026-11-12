/**
 * Nutrition-target day planner: choose a recipe for every meal slot of the next N days (default
 * two) so each day lands close to the person's daily targets.
 *
 * ## Objective (lower is better)
 *
 * For one day with totals T and targets G, using relative error so nutrients on different scales
 * are comparable:
 *
 *   energy (kcal)                 w · ((T − G) / G)²             both directions count
 *   protein, fiber (min)          w · (max(0, G − T) / G)²       only a shortfall counts
 *   sodium, sat fat, added sugar  w · (max(0, T − G) / G)²       only an excess counts
 *
 * with weights kcal 3, protein 2, fiber 1.5, sodium 1.5, saturated fat 1, added sugar 1. The plan's
 * objective is the sum over days, plus a preference term λ · mean(1 − score) over filled slots
 * (λ = 0.15 by default) so that, between nutritionally similar plans, better-liked recipes win.
 * An empty slot adds a fixed penalty of 1.
 *
 * Missing nutrient values: recipes without energy are excluded. A missing limit nutrient is
 * assumed to sit exactly at the limit's density (neutral); a missing protein or fiber value counts
 * as zero (pessimistic). Reported day totals use only real values and list gaps as incomplete.
 *
 * ## Search
 *
 * Beam search over slots in order (day 1 breakfast, lunch, dinner, day 2 …), beam width 12. A
 * partial day is compared with the targets scaled by the share of the day's energy its filled
 * slots usually carry (breakfast 25%, lunch 35%, dinner 40%). Each slot considers a pool of
 * candidates — half the best-liked, half the best single-meal fits for that slot — sized so the
 * whole search stays within about 4,000 expansions. If the budget still runs out, the best state
 * is completed greedily. No recipe is used twice in the plan. Ordering ties break on recipe ids,
 * so the same input always yields the same plan.
 *
 * The search is a generator that yields progress every `chunkSize` expansions, so a UI can spread
 * it over several frames; `planDays` runs it to completion synchronously.
 */
import {
  compareToTargets,
  sumNutrition,
  TARGET_KIND,
  type DailyTargets,
  type NutrientTotals,
  type NutritionFacts,
  type TargetNutrient,
  type TargetStatus,
} from '../nutrition';
import { SLOT_COURSES } from './autoFill';
import type { MealSlot } from './types';

export interface DayPlanCandidate {
  readonly id: string;
  readonly course: string;
  readonly nutrition: NutritionFacts;
  /** Preference score in 0..1 from the recommender. Defaults to 0.5. */
  readonly score?: number | undefined;
}

export interface PlanDaysInput {
  readonly candidates: readonly DayPlanCandidate[];
  readonly targets: DailyTargets;
  /** Number of days to plan, 1–7. Default 2. */
  readonly days?: number | undefined;
  /** Adds two snack slots per day and makes meals half portions. */
  readonly smallAppetite?: boolean | undefined;
  readonly beamWidth?: number | undefined;
  readonly maxExpansions?: number | undefined;
  readonly preferenceWeight?: number | undefined;
  /** Yield progress after this many expansions. Default 250. */
  readonly chunkSize?: number | undefined;
}

export interface DaySlotSpec {
  readonly slot: MealSlot;
  /** Typical share of the day's energy carried by this slot. */
  readonly share: number;
  /** Portion size served in this slot. */
  readonly portion: number;
}

export const STANDARD_DAY: readonly DaySlotSpec[] = [
  { slot: 'breakfast', share: 0.25, portion: 1 },
  { slot: 'lunch', share: 0.35, portion: 1 },
  { slot: 'dinner', share: 0.4, portion: 1 },
];

export const SMALL_APPETITE_DAY: readonly DaySlotSpec[] = [
  { slot: 'breakfast', share: 0.2, portion: 0.5 },
  { slot: 'snack', share: 0.1, portion: 1 },
  { slot: 'lunch', share: 0.25, portion: 0.5 },
  { slot: 'snack', share: 0.1, portion: 1 },
  { slot: 'dinner', share: 0.35, portion: 0.5 },
];

/** Nutrients in the objective, with their weights and how they are read. */
export const OBJECTIVE_TERMS: readonly {
  readonly nutrient: TargetNutrient;
  readonly weight: number;
  readonly kind: 'energy' | 'min' | 'max';
}[] = [
  { nutrient: 'kcal', weight: 3, kind: 'energy' },
  { nutrient: 'protein_g', weight: 2, kind: 'min' },
  { nutrient: 'fiber_g', weight: 1.5, kind: 'min' },
  { nutrient: 'sodium_mg', weight: 1.5, kind: 'max' },
  { nutrient: 'sat_fat_g', weight: 1, kind: 'max' },
  { nutrient: 'added_sugar_g', weight: 1, kind: 'max' },
];

export const DEFAULT_BEAM_WIDTH = 12;
export const DEFAULT_MAX_EXPANSIONS = 4000;
export const DEFAULT_PREFERENCE_WEIGHT = 0.15;
const EMPTY_SLOT_PENALTY = 1;

type Vector = readonly number[]; // aligned with OBJECTIVE_TERMS

/** Distance of one day's totals from its targets (scaled by `share` for a partial day). */
export function dayDistance(
  totals: Readonly<Partial<Record<TargetNutrient, number>>>,
  targets: DailyTargets,
  share = 1,
): number {
  return distance(
    OBJECTIVE_TERMS.map((t) => totals[t.nutrient] ?? 0),
    targets,
    share,
  );
}

function distance(v: Vector, targets: DailyTargets, share: number): number {
  let cost = 0;
  for (let i = 0; i < OBJECTIVE_TERMS.length; i += 1) {
    const term = OBJECTIVE_TERMS[i];
    if (!term) continue;
    const goal = targets[term.nutrient] * share;
    if (!(goal > 0)) continue;
    const value = v[i] ?? 0;
    let rel: number;
    if (term.kind === 'energy') rel = (value - goal) / goal;
    else if (term.kind === 'min') rel = Math.max(0, goal - value) / goal;
    else rel = Math.max(0, value - goal) / goal;
    cost += term.weight * rel * rel;
  }
  return cost;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

interface Prepared {
  readonly c: DayPlanCandidate;
  readonly vector: Vector;
  readonly pref: number;
  readonly imputed: boolean;
}

function prepare(c: DayPlanCandidate, targets: DailyTargets): Prepared | null {
  const kcal = c.nutrition.kcal;
  if (!finite(kcal) || kcal <= 0) return null;
  let imputed = false;
  const vector = OBJECTIVE_TERMS.map((term) => {
    const v = c.nutrition[term.nutrient];
    if (finite(v) && v >= 0) return v;
    imputed = true;
    if (term.kind === 'max') return (targets[term.nutrient] * kcal) / targets.kcal;
    return 0;
  });
  const raw = c.score;
  const pref = finite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
  return { c, vector, pref, imputed };
}

interface State {
  /** Index into the prepared list per filled slot, or -1 for an empty slot. */
  readonly picks: readonly number[];
  /** Totals of the day in progress. */
  readonly dayTotals: Vector;
  /** Distance of completed days. */
  readonly doneCost: number;
  /** Sum of (1 − preference) over filled slots, plus empty-slot penalties. */
  readonly prefPenalty: number;
  readonly cost: number;
}

export interface PlanProgress {
  readonly expansions: number;
  readonly depth: number;
  readonly totalDepth: number;
}

export interface PlannedDayMeal {
  readonly slot: MealSlot;
  readonly recipeId: string | null;
  readonly portion: number;
}

export interface PlannedDay {
  readonly index: number;
  readonly meals: readonly PlannedDayMeal[];
  readonly totals: NutrientTotals;
  readonly incomplete: readonly string[];
  readonly status: { readonly [K in TargetNutrient]: TargetStatus };
  readonly distance: number;
}

export type PlanNote =
  | {
      readonly kind: 'nutrient';
      readonly day: number;
      readonly nutrient: TargetNutrient;
      readonly value: number;
      readonly target: number;
      readonly status: TargetStatus;
    }
  | { readonly kind: 'empty_slot'; readonly day: number; readonly slot: MealSlot }
  | { readonly kind: 'estimated'; readonly recipeIds: readonly string[] }
  | { readonly kind: 'excluded'; readonly count: number }
  | { readonly kind: 'truncated'; readonly expansions: number };

export interface PlanDaysResult {
  readonly days: readonly PlannedDay[];
  /** Objective value of the chosen plan (see module docs). */
  readonly objective: number;
  readonly explanation: readonly PlanNote[];
  readonly search: {
    readonly expansions: number;
    readonly truncated: boolean;
    readonly beamWidth: number;
    readonly candidatesConsidered: number;
    readonly excluded: readonly string[];
  };
}

function compareSeq(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

function compareStates(a: State, b: State): number {
  return a.cost - b.cost || compareSeq(a.picks, b.picks);
}

function clampInt(n: number | undefined, lo: number, hi: number, fallback: number): number {
  if (!finite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

export function* planDaysSteps(
  input: PlanDaysInput,
): Generator<PlanProgress, PlanDaysResult, void> {
  const targets = input.targets;
  const dayCount = clampInt(input.days, 1, 7, 2);
  const layout = input.smallAppetite === true ? SMALL_APPETITE_DAY : STANDARD_DAY;
  const beamWidth = clampInt(input.beamWidth, 1, 1000, DEFAULT_BEAM_WIDTH);
  const maxExpansions = clampInt(input.maxExpansions, 1, 1_000_000, DEFAULT_MAX_EXPANSIONS);
  const lambda = finite(input.preferenceWeight)
    ? Math.max(0, input.preferenceWeight)
    : DEFAULT_PREFERENCE_WEIGHT;
  const chunkSize = clampInt(input.chunkSize, 1, 1_000_000, 250);
  const perDay = layout.length;
  const totalDepth = perDay * dayCount;

  // Sort by id so indices — and therefore every tie-break — are independent of input order.
  const sorted = [...input.candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const prepared: Prepared[] = [];
  const excluded: string[] = [];
  const seen = new Set<string>();
  for (const c of sorted) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const p = prepare(c, targets);
    if (p) prepared.push(p);
    else excluded.push(c.id);
  }

  // Candidate pool per slot of the day.
  const cap = Math.max(totalDepth, Math.floor(maxExpansions / (beamWidth * totalDepth)));
  const pools: number[][] = layout.map((spec) => {
    const courses = SLOT_COURSES[spec.slot];
    const eligible = prepared
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => courses.includes(p.c.course));
    if (eligible.length <= cap) return eligible.map((e) => e.i);
    const byPref = [...eligible].sort((a, b) => b.p.pref - a.p.pref || a.i - b.i);
    const fit = (e: { p: Prepared }) =>
      distance(
        e.p.vector.map((x) => x * spec.portion),
        targets,
        spec.share,
      );
    const byFit = eligible
      .map((e) => ({ i: e.i, f: fit(e) }))
      .sort((a, b) => a.f - b.f || a.i - b.i);
    const chosen = new Set<number>();
    for (const e of byPref) {
      if (chosen.size >= Math.ceil(cap / 2)) break;
      chosen.add(e.i);
    }
    for (const e of byFit) {
      if (chosen.size >= cap) break;
      chosen.add(e.i);
    }
    return [...chosen].sort((a, b) => a - b);
  });

  const cumulativeShare = layout.map((_, k) =>
    layout.slice(0, k + 1).reduce((s, spec) => s + spec.share, 0),
  );
  const zero: Vector = OBJECTIVE_TERMS.map(() => 0);

  const child = (state: State, pick: number): State => {
    const depth = state.picks.length;
    const k = depth % perDay;
    const spec = layout[k] as DaySlotSpec;
    const p = pick >= 0 ? prepared[pick] : undefined;
    const dayTotals = p
      ? state.dayTotals.map((v, i) => v + (p.vector[i] ?? 0) * spec.portion)
      : state.dayTotals;
    const prefPenalty = state.prefPenalty + (p ? 1 - p.pref : EMPTY_SLOT_PENALTY);
    const picks = [...state.picks, pick];
    const share = cumulativeShare[k] ?? 1;
    const dayDone = k === perDay - 1;
    const partial = distance(dayTotals, targets, dayDone ? 1 : share);
    const doneCost = dayDone ? state.doneCost + partial : state.doneCost;
    const cost = doneCost + (dayDone ? 0 : partial) + (lambda * prefPenalty) / totalDepth;
    return { picks, dayTotals: dayDone ? zero : dayTotals, doneCost, prefPenalty, cost };
  };

  const options = (state: State): number[] => {
    const k = state.picks.length % perDay;
    const used = new Set(state.picks);
    const free = (pools[k] ?? []).filter((i) => !used.has(i));
    return free.length > 0 ? free : [-1];
  };

  // States reaching the same day-sets in a different slot order are near-duplicates; keep one.
  const signature = (s: State): string => {
    const parts: string[] = [];
    for (let d = 0; d * perDay < s.picks.length; d += 1) {
      parts.push(
        s.picks
          .slice(d * perDay, (d + 1) * perDay)
          .slice()
          .sort((a, b) => a - b)
          .join('.'),
      );
    }
    return parts.join('|');
  };

  let beam: State[] = [{ picks: [], dayTotals: zero, doneCost: 0, prefPenalty: 0, cost: 0 }];
  let expansions = 0;
  let truncated = false;
  let sinceYield = 0;

  for (let depth = 0; depth < totalDepth; depth += 1) {
    if (truncated) {
      // Out of budget: extend the single best state greedily.
      const best = beam[0] as State;
      let next: State | null = null;
      for (const pick of options(best)) {
        const s = child(best, pick);
        if (next === null || compareStates(s, next) < 0) next = s;
      }
      beam = [next as State];
      continue;
    }
    const children: State[] = [];
    for (const state of beam) {
      for (const pick of options(state)) {
        if (expansions >= maxExpansions) {
          truncated = true;
          break;
        }
        children.push(child(state, pick));
        expansions += 1;
        sinceYield += 1;
        if (sinceYield >= chunkSize) {
          sinceYield = 0;
          yield { expansions, depth, totalDepth };
        }
      }
      if (truncated) break;
    }
    if (children.length === 0) {
      // Budget ran out before this depth produced anything: fall back to greedy from here.
      depth -= 1;
      continue;
    }
    children.sort(compareStates);
    const kept: State[] = [];
    const signatures = new Set<string>();
    for (const s of children) {
      const sig = signature(s);
      if (signatures.has(sig)) continue;
      signatures.add(sig);
      kept.push(s);
      if (kept.length >= beamWidth) break;
    }
    beam = kept;
  }

  const best = beam[0] as State;
  return buildResult(best, {
    prepared,
    layout,
    dayCount,
    targets,
    expansions,
    truncated,
    beamWidth,
    excluded,
  });
}

interface ResultContext {
  readonly prepared: readonly Prepared[];
  readonly layout: readonly DaySlotSpec[];
  readonly dayCount: number;
  readonly targets: DailyTargets;
  readonly expansions: number;
  readonly truncated: boolean;
  readonly beamWidth: number;
  readonly excluded: readonly string[];
}

function buildResult(best: State, ctx: ResultContext): PlanDaysResult {
  const { prepared, layout, targets } = ctx;
  const perDay = layout.length;
  const days: PlannedDay[] = [];
  const notes: PlanNote[] = [];
  const estimated = new Set<string>();

  for (let d = 0; d < ctx.dayCount; d += 1) {
    const meals: PlannedDayMeal[] = [];
    const entries: { nutrition: NutritionFacts; portion: number }[] = [];
    const vector = OBJECTIVE_TERMS.map(() => 0);
    for (let k = 0; k < perDay; k += 1) {
      const spec = layout[k] as DaySlotSpec;
      const pick = best.picks[d * perDay + k] ?? -1;
      const p = pick >= 0 ? prepared[pick] : undefined;
      meals.push({ slot: spec.slot, recipeId: p ? p.c.id : null, portion: spec.portion });
      if (p) {
        entries.push({ nutrition: p.c.nutrition, portion: spec.portion });
        p.vector.forEach((v, i) => (vector[i] = (vector[i] ?? 0) + v * spec.portion));
        if (p.imputed) estimated.add(p.c.id);
      } else {
        notes.push({ kind: 'empty_slot', day: d, slot: spec.slot });
      }
    }
    const summed = sumNutrition(entries);
    const status = compareToTargets(summed.totals, targets);
    days.push({
      index: d,
      meals,
      totals: summed.totals,
      incomplete: summed.incomplete,
      status,
      distance: distance(vector, targets, 1),
    });
    for (const term of OBJECTIVE_TERMS) {
      notes.push({
        kind: 'nutrient',
        day: d,
        nutrient: term.nutrient,
        value: summed.totals[term.nutrient],
        target: targets[term.nutrient],
        status: status[term.nutrient],
      });
    }
  }
  if (estimated.size > 0) notes.push({ kind: 'estimated', recipeIds: [...estimated].sort() });
  if (ctx.excluded.length > 0) notes.push({ kind: 'excluded', count: ctx.excluded.length });
  if (ctx.truncated) notes.push({ kind: 'truncated', expansions: ctx.expansions });

  return {
    days,
    objective: best.cost,
    explanation: notes,
    search: {
      expansions: ctx.expansions,
      truncated: ctx.truncated,
      beamWidth: ctx.beamWidth,
      candidatesConsidered: prepared.length,
      excluded: ctx.excluded,
    },
  };
}

/** Run the planner to completion in one go. */
export function planDays(input: PlanDaysInput): PlanDaysResult {
  const steps = planDaysSteps(input);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * Nutrition-only distance of any plan (sum of `dayDistance` over days, using real values with the
 * same missing-value rules as the planner). Useful for comparing plans.
 */
export function planDistance(
  days: readonly (readonly { recipeId: string | null; portion: number }[])[],
  candidates: readonly DayPlanCandidate[],
  targets: DailyTargets,
): number {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  let total = 0;
  for (const meals of days) {
    const vector = OBJECTIVE_TERMS.map(() => 0);
    for (const m of meals) {
      const c = m.recipeId === null ? undefined : byId.get(m.recipeId);
      const p = c ? prepare(c, targets) : null;
      if (!p) continue;
      p.vector.forEach((v, i) => (vector[i] = (vector[i] ?? 0) + v * m.portion));
    }
    total += distance(vector, targets, 1);
  }
  return total;
}

const NUTRIENT_WORDS: Readonly<Record<TargetNutrient, [string, string]>> = {
  kcal: ['Energy', 'kcal'],
  protein_g: ['Protein', 'g'],
  carbs_g: ['Carbohydrate', 'g'],
  fat_g: ['Fat', 'g'],
  fiber_g: ['Fiber', 'g'],
  sat_fat_g: ['Saturated fat', 'g'],
  added_sugar_g: ['Added sugar', 'g'],
  sodium_mg: ['Sodium', 'mg'],
};

const STATUS_WORDS: Readonly<Record<TargetStatus, string>> = {
  under: 'below',
  on_target: 'close to',
  over: 'above',
  met: 'meets',
  short: 'falls short of',
  within: 'stays within',
  info: 'compared with',
};

/** Plain-English lines describing a plan, for the "why this plan" sheet. */
export function explainPlan(result: PlanDaysResult): string[] {
  const lines: string[] = [];
  for (const note of result.explanation) {
    switch (note.kind) {
      case 'nutrient': {
        const [label, unit] = NUTRIENT_WORDS[note.nutrient];
        const value = Math.round(note.value);
        const target = Math.round(note.target);
        const noun = TARGET_KIND[note.nutrient] === 'max' ? 'limit' : 'target';
        const verb = STATUS_WORDS[note.status];
        lines.push(
          `Day ${note.day + 1}: ${label} ${value} ${unit} ${verb} the ${target} ${unit} ${noun}.`,
        );
        break;
      }
      case 'empty_slot':
        lines.push(`Day ${note.day + 1}: no suitable recipe was left for ${note.slot}.`);
        break;
      case 'estimated':
        lines.push(
          `${note.recipeIds.length} recipe(s) lack some nutrient data, so those values are estimated.`,
        );
        break;
      case 'excluded':
        lines.push(`${note.count} recipe(s) without calorie data were not considered.`);
        break;
      case 'truncated':
        lines.push('The search stopped early to stay fast; the plan may not be the best possible.');
        break;
    }
  }
  return lines;
}
