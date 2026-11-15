import { LruCache } from './lru';
import { parseAllergenMap, parseGoalTags } from './rows';
import { buildFtsQuery, expandQuery, phraseAlternatives, tokenize } from './searchQuery';

describe('tokenize', () => {
  it('lowercases, strips accents and drops punctuation', () => {
    expect(tokenize('Crème Brûlée, "quick"!')).toEqual(['creme', 'brulee', 'quick']);
    expect(tokenize('  -- * ')).toEqual([]);
  });
});

describe('expandQuery', () => {
  it('replaces multi-word synonyms, keeping the original as an alternative', () => {
    expect(expandQuery('pak choi stir fry')).toEqual([
      [
        ['pak', 'choi'],
        ['bok', 'choy'],
      ],
      [['stir']],
      [['fry']],
    ]);
    expect(expandQuery('Celery root soup')[0]).toEqual([['celery', 'root'], ['celeriac']]);
  });

  it('prefers the longest synonym phrase', () => {
    expect(expandQuery('garbanzo beans')).toEqual([[['garbanzo', 'beans'], ['chickpea']]]);
  });

  it('caps the number of words', () => {
    expect(expandQuery('a b c d e f g h i j k')).toHaveLength(8);
  });
});

describe('buildFtsQuery', () => {
  it('quotes and prefix-matches every token with explicit AND', () => {
    expect(buildFtsQuery('chicken curry')).toBe(`'chicken':* & 'curry':*`);
  });

  it('wraps synonym alternatives in OR groups', () => {
    expect(buildFtsQuery('aubergine')).toBe(`('aubergine':* | 'eggplant':*)`);
    expect(buildFtsQuery('courgette pak choi')).toBe(
      `('courgette':* | 'zucchini':*) & (('pak':* & 'choi':*) | ('bok':* & 'choy':*))`,
    );
  });

  it('neutralises query syntax typed by the user', () => {
    expect(buildFtsQuery('title:"x" OR NEAR(y*)')).toBe(
      `'title':* & 'x':* & 'or':* & 'near':* & 'y':*`,
    );
    expect(buildFtsQuery('" * ( ) ^ -')).toBeNull();
  });
});

describe('phraseAlternatives', () => {
  it('expands whole phrases only', () => {
    expect(phraseAlternatives('Coriander')).toEqual(['coriander', 'cilantro']);
    expect(phraseAlternatives('coriander seed')).toEqual(['coriander seed']);
    expect(phraseAlternatives('')).toEqual([]);
  });
});

describe('row parsing is fail-closed', () => {
  it('treats missing or unreadable allergen entries as unknown', () => {
    const partial = parseAllergenMap('{"milk":"free","egg":"contains","soy":"maybe"}');
    expect(partial.milk).toBe('free');
    expect(partial.egg).toBe('contains');
    expect(partial.soy).toBe('unknown');
    expect(partial.peanut).toBe('unknown');
    expect(Object.values(parseAllergenMap('not json')).every((s) => s === 'unknown')).toBe(true);
  });

  it('keeps only known goal tags', () => {
    expect(parseGoalTags('["high_protein","made_up",3]')).toEqual(['high_protein']);
    expect(parseGoalTags('oops')).toEqual([]);
  });
});

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(1);
    expect(cache.size).toBe(2);
    expect(() => new LruCache(0)).toThrow();
  });
});
