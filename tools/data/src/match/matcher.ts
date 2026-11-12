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
  'inch',
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
  'approx',
  'approximately',
  'around',
  'as',
  'at',
  'brushing',
  'decorate',
  'decoration',
  'desired',
  'drizzling',
  'dusting',
  'extra',
  'for',
  'frying',
  'garnish',
  'garnishing',
  'greasing',
  'if',
  'in',
  'less',
  'liking',
  'more',
  'necessary',
  'needed',
  'of',
  'optional',
  'required',
  'roughly',
  'serve',
  'serving',
  'so',
  'sprinkling',
  'taste',
  'the',
  'to',
  'use',
  'with',
  'you',
  'your',
  // cut, state, size, colour and preparation
  'breast',
  'chunk',
  'cube',
  'cut',
  'fillet',
  'floret',
  'half',
  'into',
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
  'pitted',
  'powdered',
  'plain',
  'prepared',
  'purple',
  'puree',
  'pureed',
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
  'thawed',
  'trimmed',
  'uncooked',
  'unsalted',
  'unsweetened',
  'virgin',
  'warm',
  'whipped',
  'white',
  'whole',
  'yellow',
  'young',
]);

/**
 * Words that leave a choice open to anything ("or other fat", "or your favourite", "or any kind").
 * A choice that names no ingredient and uses one of them could be anything, so it stays
 * unidentified. Next to a named ingredient they widen it, which is only safe for a group of foods
 * ("or other dried fruit"): see GROUP_INGREDIENTS.
 */
const OPEN_ENDED_WORDS = new Set([
  'alternatively',
  'another',
  'any',
  'anything',
  'brand',
  'choice',
  'etc',
  'favorite',
  'favourite',
  'instead',
  'kind',
  'like',
  'other',
  'prefer',
  'preference',
  'preferred',
  'something',
  'such',
  'topping',
  'type',
  'variety',
  'whatever',
  'whichever',
  // A bare "fat" could be any fat, lard and suet included; see describesFat for "low-fat".
  'fat',
  // A blend of the choices already named ("or a mix", "or both"): see MIX_WORDS.
  'both',
  'combination',
  'either',
  'mix',
  'mixture',
]);

/**
 * Open-ended words that only refer back to choices the line already names. A choice made of these
 * and descriptions ("or a mix of both") is harmless when the line names at least two identified
 * choices to blend.
 */
const MIX_WORDS = new Set(['both', 'combination', 'either', 'mix', 'mixture']);

/**
 * Open-ended words that, next to a named ingredient, do not open it to other foods: they refer back
 * to the other choices ("or a mix of both"), offer the named one instead ("chicken can be used
 * instead"), or introduce examples ("such as carrots").
 */
const NOT_WIDENING_WORDS = new Set([...MIX_WORDS, 'alternatively', 'instead', 'like', 'such', 'topping']);

/**
 * Ingredients that already stand for a group of foods with one known profile ("dried fruit", "mixed
 * vegetables"). An open-ended word only widens these: "raisins or other dried fruit" is still dried
 * fruit. Next to any other ingredient it opens the choice to foods with other allergens or diets:
 * "almond milk or other milk" could be soy milk and "chicken broth or other broth" beef broth, so
 * that choice is unidentified.
 */
const GROUP_INGREDIENTS = new Set([
  'dried_fruit',
  'mixed_berries',
  'mixed_fruit',
  'mixed_greens',
  'mixed_nuts',
  'mixed_spice',
  'mixed_vegetables',
]);

/**
 * Words saying a choice is a stand-in for something rather than the thing itself: "egg substitute"
 * is not egg, and "milk or equivalent" could be any drink. Such a choice is never identified.
 */
const STAND_IN_WORDS = new Set(['alternative', 'equivalent', 'imitation', 'replacement', 'similar', 'sub', 'substitute']);

/** "(or halva spread)", ", or more to taste", "and/or ...": a clause offering another choice. */
const CHOICE_CLAUSE = /^(?:and\s*\/\s*)?or\b\s*/i;

/** Words before "fat" that make it a fat level ("low-fat", "reduced fat", "no fat"), not a fat. */
const FAT_LEVEL_WORDS = new Set(['full', 'half', 'less', 'low', 'lower', 'no', 'non', 'reduced', 'zero']);

const isMeasureToken = (token: string) => /^\d/.test(token) || MEASURE_WORDS.has(token);
const isDescription = (token: string) => isMeasureToken(token) || NON_INGREDIENT_WORDS.has(token);

/**
 * "Fat" is a level of fat after a level word or a number ("low-fat yogurt", "non-fat", "15% fat")
 * or before "free" ("fat-free milk"), and the level word is then a description too. On its own,
 * "fat" is a fat, which could be lard or suet.
 */
const describesFat = (tokens: readonly string[], k: number) => {
  const token = tokens[k] ?? '';
  if (FAT_LEVEL_WORDS.has(token)) return tokens[k + 1] === 'fat';
  if (token !== 'fat') return false;
  const before = tokens[k - 1] ?? '';
  return FAT_LEVEL_WORDS.has(before) || /^\d/.test(before) || tokens[k + 1] === 'free';
};

/** Whether the word at `k` describes, measures or comments rather than names something. */
const describesAt = (tokens: readonly string[], k: number) => isDescription(tokens[k] ?? '') || describesFat(tokens, k);

/** A choice's words without its amounts. */
const core = (tokens: readonly string[]) => tokens.filter((t) => !isMeasureToken(t));

/** The words of the first and last choice the line's name lists, which a later clause can share. */
interface NameWords {
  first: string[];
  last: string[];
}

/**
 * What one choice turned out to be:
 * - `ingredient`: every word is part of a known ingredient or describes it;
 * - `note`: no ingredient, only amounts, comments or descriptions ("or to taste", "fresh");
 * - `blend`: no ingredient, only a reference to the other choices ("or a mix");
 * - `unidentified`: it names something the knowledge base does not know, is open-ended, or is a
 *   stand-in. Any ingredient it does name still counts.
 */
type ChoiceKind = 'ingredient' | 'note' | 'blend' | 'unidentified';

interface Choice {
  text: string;
  kind: ChoiceKind;
}

/**
 * How strictly a clause's choices are checked:
 * - `offered`: the line or clause offers the choices outright ("peanut butter or halva spread",
 *   "(or halva spread)", ", or to taste"), so every choice must be identified;
 * - `qualifying`: an aside that lists choices without offering one ("(pinto or other type)",
 *   "(fresh, frozen or canned)", "(quick or old-fashioned)"). Such asides mostly narrow the name to
 *   varieties and preparations the knowledge base need not know, so a choice there is only
 *   unidentified when it is a stand-in, or open-ended and names no ingredient.
 */
type ClauseMode = 'offered' | 'qualifying';

interface Clause {
  text: string;
  mode: ClauseMode;
}

interface Choices {
  /** Every ingredient the choices name, including those completed with a shared word. */
  ids: string[];
  /** The first choice's ingredient when it is only complete with a shared word ("chicken ... stock"). */
  firstId: string | null;
  choices: Choice[];
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

/** An aside that lists things: "pinto or other type", "fresh, frozen and/or canned", "ham & cheese". */
const LISTS = /\b(?:or|and|plus)\b|&|[a-z]\s*\/\s*[a-z]/i;

/**
 * Clauses outside the name part that hold choices: an offered choice ("(or halva spread)",
 * ", or to taste") and the parts of an aside that lists choices ("(pinto or other type)"). An aside
 * is split at commas, so an offer after a comma ("(try a mix, or other types)") is found even when
 * the aside does not start with one.
 */
function choiceClauses(name: string): Clause[] {
  const out: Clause[] = [];
  const offered = (text: string) => {
    const trimmed = text.trim();
    if (!CHOICE_CLAUSE.test(trimmed)) return false;
    out.push({ text: trimmed.replace(CHOICE_CLAUSE, ''), mode: 'offered' });
    return true;
  };
  for (const aside of name.matchAll(/\(([^()]*)\)|\[([^[\]]*)\]/g)) {
    const inner = (aside[1] ?? aside[2] ?? '').trim();
    if (offered(inner)) continue;
    const lists = LISTS.test(inner);
    for (const part of inner.split(/[,;]/)) {
      if (!offered(part) && lists && part.trim()) out.push({ text: part.trim(), mode: 'qualifying' });
    }
  }
  for (const clause of stripParentheticals(name).split(/[,;:]|\s+-\s+/).slice(1)) offered(clause);
  return out;
}

/**
 * Classifies a choice from the words that no ingredient, amount or description accounts for. In a
 * qualifying aside an unknown word is taken as a variety or preparation of the named ingredient
 * rather than a choice of its own, and a mix ("try a mix of red and green") blends those varieties.
 */
function classify(leftover: readonly string[], named: readonly string[], mode: ClauseMode): ChoiceKind {
  if (leftover.some((w) => STAND_IN_WORDS.has(w))) return 'unidentified';
  if (mode === 'offered' && leftover.some((w) => !OPEN_ENDED_WORDS.has(w))) return 'unidentified';
  const open = leftover.filter((w) => OPEN_ENDED_WORDS.has(w));
  if (named.length > 0) {
    const widened = open.some((w) => !NOT_WIDENING_WORDS.has(w));
    return widened && !named.every((id) => GROUP_INGREDIENTS.has(id)) ? 'unidentified' : 'ingredient';
  }
  if (open.length === 0) return 'note';
  if (!open.every((w) => MIX_WORDS.has(w))) return 'unidentified';
  return mode === 'offered' ? 'blend' : 'note';
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
   * stock, and "chicken thighs or breasts" offers chicken breasts. A choice in a clause after the
   * name can share the name's words the same way: "milk (dairy or soy)" offers soy milk. Every word
   * of a choice must then belong to an ingredient or be a measure or description; one unexplained
   * word ("cookie" in "cookie butter", "vegan" in "vegan mayo") leaves an offered choice
   * unidentified (see `ClauseMode` for asides). With `single`, a text that lists only one choice is
   * checked too.
   */
  private resolveChoices(text: string, single: boolean, mode: ClauseMode, name?: NameWords): Choices {
    const tokens = tokenize(text.replace(/([a-z])\s*\/\s*(?=[a-z])/gi, '$1 or '));
    const choices = splitChoices(tokens);
    const ids = new Set<string>();
    const out: Choices = { ids: [], firstId: null, choices: [] };
    if (choices.length === 0 || (choices.length === 1 && !single)) return out;
    const matches = this.findInTokens(tokens);
    const first = core(choices[0]?.tokens ?? []);
    const last = core(choices.at(-1)?.tokens ?? []);
    choices.forEach((choice, i) => {
      const words = core(choice.tokens);
      const end = choice.start + choice.tokens.length;
      /** Words of the choice that no match covers and that do not describe or measure. */
      const unexplained = (found: readonly IngredientMatch[]) =>
        choice.tokens.filter(
          (_, k) => !describesAt(choice.tokens, k) && !found.some((m) => m.start <= choice.start + k && choice.start + k < m.start + m.length),
        );
      let inChoice = matches.filter((m) => m.start < end && m.start + m.length > choice.start);
      // A phrase that spans a separator ("butter or margarine") can cut a choice short and leave
      // words behind ("margarine spread"); the choice is then also matched on its own words.
      const crossing = inChoice.some((m) => m.start < choice.start || m.start + m.length > end);
      if (crossing && unexplained(inChoice).length > 0) {
        inChoice = [...inChoice, ...this.findInTokens(choice.tokens).map((m) => ({ ...m, start: m.start + choice.start }))];
      }
      // A shared trailing word ("chicken or vegetable stock"), unless the last choice merely
      // extends this one ("cream or cream cheese"), where this choice stands on its own.
      let shared: string | null = null;
      const extendsThis = words.length > 0 && words.every((w, k) => last[k] === w);
      if (words.length > 0 && i < choices.length - 1 && !extendsThis) {
        for (let k = 1; k < last.length && !shared; k++) shared = this.index.get([...words, ...last.slice(-k)].join(' ')) ?? null;
      }
      // A shared leading word ("chicken thighs or breasts"), for a choice that is not complete alone.
      if (!shared && words.length > 0 && i > 0 && inChoice.length === 0) {
        for (let k = first.length - 1; k >= 1 && !shared; k--) shared = this.index.get([...first.slice(0, k), ...words].join(' ')) ?? null;
      }
      // A word shared with the name the clause follows: "milk (dairy or soy)", "chicken breast (or thighs)".
      if (!shared && name && inChoice.length === 0 && unexplained([]).length > 0) {
        for (let k = 1; k <= name.last.length && !shared; k++) shared = this.index.get([...words, ...name.last.slice(-k)].join(' ')) ?? null;
        for (let k = 1; k <= name.first.length && !shared; k++) shared = this.index.get([...name.first.slice(0, k), ...words].join(' ')) ?? null;
      }
      if (shared) {
        ids.add(shared);
        if (i === 0) out.firstId = shared;
      }
      for (const m of inChoice) ids.add(m.id);
      // A shared-word ingredient spans the whole choice; otherwise only the matched words count.
      const leftover = shared ? [] : unexplained(inChoice);
      // "Or substitute frozen berries" uses the word as a verb (use instead), not as a stand-in product;
      // a bare "or substitute" names nothing to use instead, so it stays open.
      if (leftover[0] === 'substitute' && words[0] === 'substitute') leftover[0] = inChoice.length > 0 ? 'instead' : 'other';
      out.choices.push({ text: choice.tokens.join(' '), kind: classify(leftover, shared ? [shared] : inChoice.map((m) => m.id), mode) });
    });
    out.ids = [...ids];
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
    const named = splitChoices(tokenize(listed));
    const nameWords: NameWords = { first: core(named[0]?.tokens ?? []), last: core(named.at(-1)?.tokens ?? []) };
    const groups = [
      this.resolveChoices(listed, false, 'offered'),
      ...choiceClauses(name).map((clause) => this.resolveChoices(clause.text, true, clause.mode, nameWords)),
    ];
    // For "A or B" the amount was written for A, so A is the primary ingredient.
    const firstChoice = head.split(/\s+or\s+/i)[0] ?? head;
    let primary = this.lookup(head) ?? groups[0]?.firstId ?? this.lookup(firstChoice);
    if (!primary) {
      const candidates = [this.findAll(firstChoice), this.findAll(head), this.findAll(cleaned), this.findAll(name)].find((m) => m.length > 0);
      primary = candidates?.[0]?.id ?? null;
    }
    if (!primary) return { id: null, all: [], unresolved: [] };
    // Everything the line names, including asides such as "(ham, chicken or tofu)" and
    // alternatives such as "butter or margarine", feeds the allergen and diet roll-ups.
    const all = new Set<string>([primary]);
    for (const group of groups) for (const id of group.ids) all.add(id);
    for (const match of this.findAll(name)) all.add(match.id);
    // "Or a mix" blends the other choices, so it is only identified when there are two to blend.
    const choices = groups.flatMap((g) => g.choices);
    const identified = choices.filter((c) => c.kind === 'ingredient').length;
    const unresolved = choices.filter((c) => c.kind === 'unidentified' || (c.kind === 'blend' && identified < 2)).map((c) => c.text);
    return { id: primary, all: [...all], unresolved: [...new Set(unresolved)] };
  }
}
