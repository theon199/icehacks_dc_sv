import type { IngredientDef } from '../knowledge/define.ts';
import { normalizeKey, stripParentheticals, tokenize } from './normalize.ts';

const MAX_NGRAM = 7;

export interface IngredientMatch {
  id: string;
  /** Token span within the searched text. */
  start: number;
  length: number;
}

export interface LineMatch {
  /** Primary ingredient for the line (the longest, earliest match in the name part). */
  id: string | null;
  /** Every ingredient named in the name part, e.g. "salt and pepper" -> salt, black_pepper. */
  all: string[];
  /**
   * Choices or items the line lists that name no known ingredient, e.g. "halva spread" in
   * "peanut butter or halva spread". Their composition is unknown, so the recipe's allergen and diet
   * roll-ups must not treat the line as fully identified.
   */
  unresolved: string[];
}

/** Words that separate the choices or items a line lists. */
const SEPARATORS = new Set(['or', 'and', 'plus']);

/** Amounts and units inside a choice ("or 2 tbsp honey"), which never name an ingredient. */
const MEASURE_WORDS = new Set([
  'a',
  'an',
  'bag',
  'bit',
  'box',
  'block',
  'bottle',
  'bulb',
  'bunch',
  'can',
  'carton',
  'container',
  'cup',
  'dash',
  'drizzle',
  'few',
  'g',
  'gram',
  'handful',
  'head',
  'jar',
  'kg',
  'knob',
  'l',
  'lb',
  'liter',
  'litre',
  'little',
  'ml',
  'ounce',
  'oz',
  'pack',
  'package',
  'packet',
  'piece',
  'pinch',
  'pot',
  'pound',
  'sachet',
  'some',
  'splash',
  'sprinkle',
  'tablespoon',
  'tbsp',
  'teaspoon',
  'tin',
  'tsp',
  'tub',
]);

/**
 * Words that describe, qualify or comment on an ingredient without naming one. A choice made only
 * of these ("or to taste", "fresh or frozen", "or more if needed") adds no ingredient of its own.
 * Tokens are compared after normalisation, so plurals are already singular.
 */
const NON_INGREDIENT_WORDS = new Set([
  // serving notes and quantities
  'about',
  'additional',
  'alternative',
  'alternatively',
  'another',
  'any',
  'approx',
  'approximately',
  'around',
  'as',
  'at',
  'both',
  'brushing',
  'choice',
  'combination',
  'decorate',
  'decoration',
  'desired',
  'drizzling',
  'dusting',
  'either',
  'equivalent',
  'extra',
  'favorite',
  'favourite',
  'for',
  'frying',
  'garnish',
  'garnishing',
  'greasing',
  'if',
  'in',
  'instead',
  'kind',
  'less',
  'like',
  'liking',
  'mix',
  'mixture',
  'more',
  'necessary',
  'needed',
  'of',
  'optional',
  'other',
  'prefer',
  'preference',
  'preferred',
  'required',
  'roughly',
  'serve',
  'serving',
  'similar',
  'so',
  'sprinkling',
  'substitute',
  'such',
  'taste',
  'the',
  'to',
  'topping',
  'type',
  'use',
  'variety',
  'with',
  'you',
  'your',
  // cut, state, size, colour and preparation
  'chunk',
  'cube',
  'floret',
  'half',
  'ring',
  'round',
  'segment',
  'slice',
  'spear',
  'strip',
  'tidbit',
  'wedge',
  'aged',
  'baby',
  'best',
  'big',
  'black',
  'boneless',
  'bottled',
  'bought',
  'brown',
  'canned',
  'chilled',
  'chopped',
  'coarse',
  'coarsely',
  'cold',
  'cooked',
  'crushed',
  'cubed',
  'dark',
  'diced',
  'dried',
  'drained',
  'dry',
  'fat',
  'fine',
  'finely',
  'firm',
  'free',
  'fresh',
  'frozen',
  'full',
  'golden',
  'good',
  'grated',
  'green',
  'ground',
  'halved',
  'home',
  'homemade',
  'hot',
  'jarred',
  'large',
  'lean',
  'leftover',
  'light',
  'low',
  'made',
  'mature',
  'medium',
  'melted',
  'mild',
  'minced',
  'organic',
  'peeled',
  'plain',
  'prepared',
  'purple',
  'quality',
  'quartered',
  'range',
  'raw',
  'ready',
  'red',
  'reduced',
  'regular',
  'rinsed',
  'ripe',
  'room',
  'salted',
  'shop',
  'shredded',
  'skinless',
  'sliced',
  'small',
  'sodium',
  'soft',
  'softened',
  'store',
  'strong',
  'sweetened',
  'temperature',
  'thick',
  'thin',
  'thinly',
  'trimmed',
  'uncooked',
  'unsalted',
  'unsweetened',
  'virgin',
  'warm',
  'white',
  'whole',
  'yellow',
  'young',
]);

/** "(or halva spread)", ", or more to taste", "and/or ...": a clause offering another choice. */
const CHOICE_CLAUSE = /^(?:and\s*\/\s*)?or\b\s*/i;

const isMeasureToken = (token: string) => /^\d/.test(token) || MEASURE_WORDS.has(token);
const isNonIngredient = (token: string) => isMeasureToken(token) || NON_INGREDIENT_WORDS.has(token);

interface Choices {
  /** Ingredients the choices resolve to, beyond plain matches of the text. */
  ids: string[];
  /** The first choice's ingredient when it is only complete with a shared word ("chicken ... stock"). */
  firstId: string | null;
  unresolved: string[];
}

/** Splits tokens at separators into the choices or items they list, skipping empty ones. */
function splitChoices(tokens: readonly string[]): Array<{ start: number; tokens: string[] }> {
  const out: Array<{ start: number; tokens: string[] }> = [];
  let current: { start: number; tokens: string[] } = { start: 0, tokens: [] };
  tokens.forEach((token, i) => {
    if (SEPARATORS.has(token)) {
      if (current.tokens.length > 0) out.push(current);
      current = { start: i + 1, tokens: [] };
      return;
    }
    current.tokens.push(token);
  });
  if (current.tokens.length > 0) out.push(current);
  return out;
}

/** Clauses outside the name part that offer another choice: "(or halva spread)", ", or to taste". */
function choiceClauses(name: string): string[] {
  const out: string[] = [];
  for (const aside of name.matchAll(/\(([^()]*)\)|\[([^[\]]*)\]/g)) {
    const inner = (aside[1] ?? aside[2] ?? '').trim();
    if (CHOICE_CLAUSE.test(inner)) out.push(inner.replace(CHOICE_CLAUSE, ''));
  }
  for (const clause of stripParentheticals(name).split(/[,;:]|\s+-\s+/).slice(1)) {
    const trimmed = clause.trim();
    if (CHOICE_CLAUSE.test(trimmed)) out.push(trimmed.replace(CHOICE_CLAUSE, ''));
  }
  return out;
}

export class IngredientMatcher {
  private readonly index = new Map<string, string>();
  readonly collisions: Array<{ key: string; ids: [string, string] }> = [];

  constructor(defs: readonly IngredientDef[]) {
    for (const def of defs) {
      for (const phrase of [def.id.replace(/_/g, ' '), def.name, ...(def.plural ? [def.plural] : []), ...def.syn]) {
        const key = normalizeKey(phrase);
        if (!key) continue;
        const existing = this.index.get(key);
        if (existing && existing !== def.id) {
          this.collisions.push({ key, ids: [existing, def.id] });
          continue;
        }
        this.index.set(key, def.id);
      }
    }
  }

  /** Exact synonym lookup (after normalisation). */
  lookup(text: string): string | null {
    return this.index.get(normalizeKey(text)) ?? null;
  }

  /** Greedy longest-first, non-overlapping n-gram matches. */
  findAll(text: string): IngredientMatch[] {
    return this.findInTokens(tokenize(text));
  }

  private findInTokens(tokens: readonly string[]): IngredientMatch[] {
    const taken = new Array<boolean>(tokens.length).fill(false);
    const matches: IngredientMatch[] = [];
    for (let n = Math.min(MAX_NGRAM, tokens.length); n >= 1; n--) {
      for (let start = 0; start + n <= tokens.length; start++) {
        if (taken.slice(start, start + n).some(Boolean)) continue;
        const id = this.index.get(tokens.slice(start, start + n).join(' '));
        if (!id) continue;
        matches.push({ id, start, length: n });
        for (let k = start; k < start + n; k++) taken[k] = true;
      }
    }
    return matches.sort((a, b) => b.length - a.length || a.start - b.start);
  }

  /**
   * Resolves each choice or item a text lists ("peanut butter or halva spread", "salt and pepper").
   * Words shared between choices are distributed: "chicken or vegetable stock" offers chicken
   * stock, and "chicken thighs or breasts" offers chicken breasts. A choice that names no known
   * ingredient and is not just a comment ("to taste") or a description ("fresh or frozen") is
   * reported as unresolved. With `single`, a text that lists only one choice is checked too.
   */
  private resolveChoices(text: string, single: boolean): Choices {
    const tokens = tokenize(text.replace(/([a-z])\s*\/\s*(?=[a-z])/gi, '$1 or '));
    const choices = splitChoices(tokens);
    const out: Choices = { ids: [], firstId: null, unresolved: [] };
    if (choices.length === 0 || (choices.length === 1 && !single)) return out;
    const matches = this.findInTokens(tokens);
    const core = (tokens: readonly string[]) => tokens.filter((t) => !isMeasureToken(t));
    const first = core(choices[0]?.tokens ?? []);
    const last = core(choices.at(-1)?.tokens ?? []);
    choices.forEach((choice, i) => {
      const words = core(choice.tokens);
      const end = choice.start + choice.tokens.length;
      const found = matches.filter((m) => m.start < end && m.start + m.length > choice.start).map((m) => m.id);
      // A shared trailing word ("chicken or vegetable stock"), unless the last choice merely
      // extends this one ("cream or cream cheese"), where this choice stands on its own.
      let shared: string | null = null;
      const extendsThis = words.length > 0 && words.every((w, k) => last[k] === w);
      if (words.length > 0 && i < choices.length - 1 && !extendsThis) {
        for (let k = 1; k < last.length && !shared; k++) shared = this.index.get([...words, ...last.slice(-k)].join(' ')) ?? null;
      }
      // A shared leading word ("chicken thighs or breasts"), for a choice that is not complete alone.
      if (!shared && words.length > 0 && i > 0 && found.length === 0) {
        for (let k = first.length - 1; k >= 1 && !shared; k--) shared = this.index.get([...first.slice(0, k), ...words].join(' ')) ?? null;
      }
      if (shared) {
        out.ids.push(shared);
        if (i === 0) out.firstId = shared;
      }
      out.ids.push(...found);
      if (shared || found.length > 0 || words.every(isNonIngredient)) return;
      out.unresolved.push(choice.tokens.join(' '));
    });
    return out;
  }

  /**
   * Matches an ingredient line. `name` is the ingredient part (without the amount). Text before the
   * first comma is the name; preparation notes after it are only searched when the name is unknown.
   */
  matchLine(name: string): LineMatch {
    const cleaned = stripParentheticals(name.replace(/\s+-\s+.*$/, ''));
    const head = cleaned.split(/[,;:]/)[0] ?? '';
    // Asides are removed before the note after a dash, so a dash inside "(... - try a mix)" never
    // pulls the aside's words into the name.
    const listed = stripParentheticals(name).replace(/\s+-\s+.*$/, '').split(/[,;:]/)[0] ?? '';
    const choices = [this.resolveChoices(listed, false), ...choiceClauses(name).map((clause) => this.resolveChoices(clause, true))];
    // For "A or B" the amount was written for A, so A is the primary ingredient.
    const firstChoice = head.split(/\s+or\s+/i)[0] ?? head;
    let primary = this.lookup(head) ?? choices[0]?.firstId ?? this.lookup(firstChoice);
    if (!primary) {
      const candidates = [this.findAll(firstChoice), this.findAll(head), this.findAll(cleaned), this.findAll(name)].find((m) => m.length > 0);
      primary = candidates?.[0]?.id ?? null;
    }
    if (!primary) return { id: null, all: [], unresolved: [] };
    // Everything the line names, including asides such as "(ham, chicken or tofu)" and
    // alternatives such as "butter or margarine", feeds the allergen and diet roll-ups.
    const all = new Set<string>([primary]);
    for (const resolved of choices) for (const id of resolved.ids) all.add(id);
    for (const match of this.findAll(name)) all.add(match.id);
    return { id: primary, all: [...all], unresolved: [...new Set(choices.flatMap((c) => c.unresolved))] };
  }
}
