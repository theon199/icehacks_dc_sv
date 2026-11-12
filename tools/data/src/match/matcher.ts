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
    const tokens = tokenize(text);
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
   * Matches an ingredient line. `name` is the ingredient part (without the amount). Text before the
   * first comma is the name; preparation notes after it are only searched when the name is unknown.
   */
  matchLine(name: string): LineMatch {
    const cleaned = stripParentheticals(name.replace(/\s+-\s+.*$/, ''));
    const head = cleaned.split(/[,;:]/)[0] ?? '';
    let primary = this.lookup(head);
    if (!primary) {
      const candidates = [this.findAll(head), this.findAll(cleaned), this.findAll(name)].find((m) => m.length > 0);
      primary = candidates?.[0]?.id ?? null;
    }
    if (!primary) return { id: null, all: [] };
    // Everything the line names, including asides such as "(ham, chicken or tofu)" and
    // alternatives such as "butter or margarine", feeds the allergen and diet roll-ups.
    const all = new Set<string>([primary]);
    for (const match of this.findAll(name)) all.add(match.id);
    return { id: primary, all: [...all] };
  }
}
