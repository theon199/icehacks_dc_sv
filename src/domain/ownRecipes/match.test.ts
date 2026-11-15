import { isPlausibleMatch, lookupPhrases, matchIngredient, matchIngredients } from './match';
import { foodWords, nameKey, singular } from './words';

const ingredient = (id: string, name = id.replace(/_/g, ' '), plural: string | null = null) => ({
  id,
  name,
  plural,
});

describe('words', () => {
  it('singularises everyday plurals without breaking short words', () => {
    expect(
      ['tomatoes', 'leaves', 'berries', 'cookies', 'peas', 'asparagus', 'bus'].map(singular),
    ).toEqual(['tomato', 'leaf', 'berry', 'cookie', 'pea', 'asparagus', 'bus']);
  });

  it('drops filler words and accents', () => {
    expect(foodWords('Some fresh Jalapeños')).toEqual(['jalapeno']);
    expect(nameKey('The Tomatoes')).toBe('tomato');
  });
});

describe('isPlausibleMatch', () => {
  it('accepts the same food without descriptive words', () => {
    expect(isPlausibleMatch('red onions', ingredient('onion'))).toBe(true);
    expect(isPlausibleMatch('rice', ingredient('white_rice'))).toBe(true);
  });

  it('never turns a compound food into its last word', () => {
    expect(isPlausibleMatch('peanut butter', ingredient('butter'))).toBe(false);
    expect(isPlausibleMatch('sweet potato', ingredient('potato'))).toBe(false);
  });

  it('never swaps one described food for another', () => {
    expect(isPlausibleMatch('brown rice', ingredient('white_rice'))).toBe(false);
  });

  it('rejects names with no food words', () => {
    expect(isPlausibleMatch('the', ingredient('the'))).toBe(false);
  });
});

describe('matchIngredient', () => {
  it('tries the full name, then its main word, and keeps only plausible results', async () => {
    const searched: string[] = [];
    const search = (text: string) => {
      searched.push(text);
      return Promise.resolve(
        text === 'chopped onion' ? [ingredient('green_onion')] : [ingredient('onion')],
      );
    };
    await expect(matchIngredient('chopped onion', search)).resolves.toEqual(ingredient('onion'));
    expect(searched).toEqual(['chopped onion', 'onion']);
    expect(lookupPhrases('')).toEqual([]);
  });

  it('returns null when nothing plausible comes back', async () => {
    const search = () => Promise.resolve([ingredient('butter')]);
    await expect(matchIngredient('peanut butter', search)).resolves.toBeNull();
  });

  it('matches each food once however it is written', async () => {
    const search = jest.fn((text: string) => Promise.resolve([ingredient(text)]));
    const matches = await matchIngredients(['Tomatoes', 'tomato', '...'], search);
    expect([...matches.keys()]).toEqual(['tomato']);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
