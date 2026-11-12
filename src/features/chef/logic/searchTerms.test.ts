import { MAX_SEARCH_TERMS, searchTermsFrom } from './searchTerms';

describe('searchTermsFrom', () => {
  it('keeps the food words of a question', () => {
    expect(searchTermsFrom('Anything quick with chickpeas and spinach tonight?')).toEqual([
      'chickpeas',
      'spinach',
    ]);
  });

  it('drops numbers, short words and repeats, and stops at the limit', () => {
    const terms = searchTermsFrom('tofu tofu 30 a rice miso kale leek beans');
    expect(terms).toEqual(['tofu', 'rice', 'miso', 'kale']);
    expect(terms).toHaveLength(MAX_SEARCH_TERMS);
  });

  it('returns nothing for small talk', () => {
    expect(searchTermsFrom('Thanks, that helps!')).toEqual([]);
  });
});
