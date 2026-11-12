import { searchTextOf, tidyQuery } from './useSearchResults';

describe('search text normalisation', () => {
  it('tidies what is shown and remembered without changing its words', () => {
    expect(tidyQuery('  Lentil   soup ')).toBe('Lentil soup');
    expect(tidyQuery('   ')).toBe('');
  });

  it('searches by word tokens, so equivalent text shares one query', () => {
    expect(searchTextOf('Lentil soup ')).toBe('lentil soup');
    expect(searchTextOf('  lentil,  SOUP!')).toBe('lentil soup');
    expect(searchTextOf('crème brûlée')).toBe('creme brulee');
    expect(searchTextOf('?!')).toBe('');
  });
});
