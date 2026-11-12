import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { MatchedLine } from '../src/derive/rollup.ts';
import type { IngredientDef } from '../src/knowledge/define.ts';
import { INGREDIENTS, INGREDIENT_BY_ID } from '../src/knowledge/index.ts';
import { ALIAS_DESCRIPTORS, SEARCH_ALIASES } from '../src/knowledge/searchAliases.ts';
import { IngredientMatcher } from '../src/match/matcher.ts';
import { parseMeasure } from '../src/parse/measure.ts';
import { DB_PATH } from '../src/paths.ts';
import { aliasIndexWords, aliasIndexWordsById, aliasTokenViolations, cuisineWordKeys, foodWordKeys, SearchIndexer } from '../src/pipeline/search.ts';

const matcher = new IngredientMatcher(INGREDIENTS);
const def = (id: string): IngredientDef => {
  const found = INGREDIENT_BY_ID.get(id);
  assert.ok(found, `missing ingredient ${id}`);
  return found;
};
const matchedLine = (text: string): MatchedLine => {
  const result = matcher.matchLine(parseMeasure(text).rest);
  return result.id === null ? null : result.all.map(def);
};

/** Descriptor words that once leaked into the index from multi-word aliases. */
const LEAKED_DESCRIPTORS = [
  'french', 'string', 'half', 'plain', 'leaves', 'root', 'sweet', 'corn', 'navy', 'self', 'rising',
  'ladies', 'fingers', 'double', 'single', 'whipping', 'caster', 'granulated',
];

describe('search alias tokens', () => {
  const indexed = aliasIndexWordsById(INGREDIENTS);
  const allWords = [...indexed.values()].flat();

  it('indexes no cuisine word and no known descriptor (quality gate)', () => {
    assert.deepEqual(aliasTokenViolations(INGREDIENTS), []);
    const cuisines = cuisineWordKeys();
    for (const word of allWords) {
      assert.ok(!cuisines.has(word), `cuisine word "${word}" indexed from an alias`);
      assert.ok(!ALIAS_DESCRIPTORS.has(word), `descriptor "${word}" indexed from an alias`);
    }
    for (const word of LEAKED_DESCRIPTORS) assert.ok(!allWords.includes(word), `"${word}" indexed from an alias`);
  });

  it('keeps only food words from multi-word aliases', () => {
    const foods = foodWordKeys(INGREDIENTS);
    assert.deepEqual(aliasIndexWords('coriander leaves', foods), ['coriander']);
    assert.deepEqual(aliasIndexWords('sweet pepper', foods), ['pepper']);
    assert.deepEqual(aliasIndexWords('plain flour', foods), ['flour']);
    assert.deepEqual(aliasIndexWords('corn starch', foods), ['starch']);
    assert.deepEqual(aliasIndexWords('half and half', foods), []);
    assert.deepEqual(aliasIndexWords('french beans', foods), []);
    assert.deepEqual(aliasIndexWords('ladies fingers', foods), []);
    assert.deepEqual(aliasIndexWords('self rising flour', foods), ['flour']);
  });

  it('still indexes the dialect names aliases exist for', () => {
    assert.ok(indexed.get('cilantro')?.includes('coriander'));
    assert.ok(indexed.get('eggplant')?.includes('aubergine'));
    assert.ok(indexed.get('chickpea')?.includes('garbanzo'));
    assert.ok(indexed.get('white_bean')?.includes('haricot'));
    assert.ok(indexed.get('cornstarch')?.includes('cornflour'));
  });

  it('every alias entry indexes at least one word', () => {
    for (const id of Object.keys(SEARCH_ALIASES)) assert.ok(indexed.has(id), id);
  });

  it('the gate flags descriptor and cuisine aliases', () => {
    const bad = aliasTokenViolations(INGREDIENTS, { green_bean: ['french', 'string'], basil: ['thai'] });
    const words = bad.map((v) => `${v.id}:${v.word}:${v.reason.includes('cuisine') ? 'cuisine' : 'descriptor'}`).sort();
    assert.deepEqual(words, ['basil:thai:cuisine', 'green_bean:french:cuisine', 'green_bean:french:descriptor', 'green_bean:string:descriptor']);
  });
});

describe('search index words per line', () => {
  const indexer = new SearchIndexer(INGREDIENTS);
  const wordsFor = (text: string): string[] => {
    const name = parseMeasure(text).rest;
    const line = matchedLine(text);
    assert.ok(line, `unmatched ${text}`);
    return line.flatMap((d) => indexer.lineWords(d, name));
  };
  const lacks = (text: string, ...absent: string[]) => {
    const words = wordsFor(text);
    for (const word of absent) assert.ok(!words.includes(word), `${text}: ${words.join(' ')}`);
  };

  it('does not index alias descriptors the line does not use', () => {
    lacks('200g green beans', 'french', 'string');
    lacks('1 tbsp cornstarch', 'corn');
    lacks('1 red bell pepper', 'sweet');
    lacks('1 bunch cilantro', 'leaves');
    lacks('2 cups all-purpose flour', 'plain');
    lacks('1 cup light cream', 'half', 'single');
    lacks('1 cup heavy cream', 'double', 'whipping');
    lacks('400g white beans', 'navy');
    lacks('1 celeriac', 'root', 'celery');
    lacks('1 cup sugar', 'caster', 'granulated');
    lacks('200g okra', 'ladies', 'fingers');
  });

  it('still indexes the line’s own wording', () => {
    assert.ok(wordsFor('1 bunch coriander leaves').includes('coriander'));
    assert.ok(wordsFor('1 tbsp cornstarch').includes('cornflour'));
  });
});

describe('shipped catalog search', { skip: !existsSync(DB_PATH) && 'catalog not built' }, () => {
  /**
   * A hit is related when every query word (or a plural) appears in the title, the cuisine label,
   * an ingredient line or the name of a matched ingredient.
   */
  const unrelatedHits = (query: string): { hits: number; unrelated: string[] } => {
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const rows = db.prepare('SELECT recipe_id, title, cuisine FROM recipes_fts WHERE recipes_fts MATCH ?').all(query) as { recipe_id: string; title: string; cuisine: string }[];
      const lines = db.prepare(
        `SELECT ri.text || ' ' || coalesce(i.name, '') || ' ' || coalesce(i.plural, '') AS t
         FROM recipe_ingredients ri LEFT JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.recipe_id = ?`,
      );
      const words = query.replace(/^\w+:/, '').replace(/"/g, '').split(/\s+/);
      const unrelated = rows.filter((r) => {
        const text = [r.title, r.cuisine, ...(lines.all(r.recipe_id) as { t: string }[]).map((l) => l.t)].join(' ');
        return !words.every((w) => new RegExp(`\\b${w}(?:s|es|ed)?\\b`, 'i').test(text));
      });
      return { hits: rows.length, unrelated: unrelated.map((r) => r.title) };
    } finally {
      db.close();
    }
  };

  for (const query of ['french', 'string', 'half', 'ingredients:plain', 'ingredients:leaves', 'corn', 'sweet potato', 'root', 'navy']) {
    it(`"${query}" returns no unrelated recipes`, () => {
      const { unrelated } = unrelatedHits(query);
      assert.deepEqual(unrelated, []);
    });
  }

  it('"french" no longer finds green curry and "sweet potato" no longer finds pepper bakes', () => {
    const titles = (q: string) => {
      const db = new Database(DB_PATH, { readonly: true });
      try {
        return (db.prepare('SELECT title FROM recipes_fts WHERE recipes_fts MATCH ?').all(q) as { title: string }[]).map((r) => r.title);
      } finally {
        db.close();
      }
    };
    assert.ok(!titles('french').includes('Thai Green Curry'));
    assert.ok(!titles('sweet potato').includes('Chicken Pepper Bake'));
  });
});
