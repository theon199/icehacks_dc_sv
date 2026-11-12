import {
  isPlausibleMatch,
  lookupPhrases,
  matchIngredient,
  matchIngredients,
  type MatchableIngredient,
} from './ingredientMatch';
import { foodWords, nameKey, singular, wordOverlap } from './words';

const ing = (id: string, name: string, plural: string | null = null): MatchableIngredient => ({
  id,
  name,
  plural,
});

describe('food words', () => {
  it('singularises everyday plurals', () => {
    expect(singular('tomatoes')).toBe('tomato');
    expect(singular('berries')).toBe('berry');
    expect(singular('peaches')).toBe('peach');
    expect(singular('eggs')).toBe('egg');
    expect(singular('leaves')).toBe('leaf');
    expect(singular('hummus')).toBe('hummus');
    expect(singular('glass')).toBe('glass');
  });

  it('keeps singulars that end in -ie and leaves short words alone', () => {
    expect(singular('pies')).toBe('pie');
    expect(singular('cookies')).toBe('cookie');
    expect(singular('brownies')).toBe('brownie');
    expect(singular('smoothies')).toBe('smoothie');
    expect(singular('cherries')).toBe('cherry');
    expect(singular('fries')).toBe('fry');
    expect(singular('gas')).toBe('gas');
    expect(singular('figs')).toBe('fig');
  });

  it('drops filler and packaging words', () => {
    expect(foodWords('A bag of Fresh Spinach')).toEqual(['spinach']);
    expect(nameKey('Tomatoes')).toBe(nameKey('tomato'));
  });

  it('measures word overlap', () => {
    expect(wordOverlap('Chicken Tikka Masala', 'chicken tikka masala')).toBe(1);
    expect(wordOverlap('Chicken curry', 'Beef curry')).toBeCloseTo(1 / 3);
    expect(wordOverlap('', 'anything')).toBe(0);
  });
});

describe('ingredient matching', () => {
  it('tries the full name, then its main word', () => {
    expect(lookupPhrases('Cherry tomatoes')).toEqual(['cherry tomato', 'tomato']);
    expect(lookupPhrases('Eggs')).toEqual(['egg']);
    expect(lookupPhrases('  ')).toEqual([]);
  });

  it('accepts names that differ only by describing words', () => {
    expect(isPlausibleMatch('Cherry tomatoes', ing('tomato', 'tomato', 'tomatoes'))).toBe(true);
    expect(isPlausibleMatch('red onion', ing('onion', 'onion'))).toBe(true);
    expect(isPlausibleMatch('rice', ing('white_rice', 'white rice'))).toBe(true);
    expect(isPlausibleMatch('green onions', ing('green_onion', 'green onion'))).toBe(true);
  });

  it('refuses a different food that shares a word', () => {
    expect(isPlausibleMatch('peanut butter', ing('butter', 'butter'))).toBe(false);
    expect(isPlausibleMatch('sweet potato', ing('potato', 'potato'))).toBe(false);
    expect(isPlausibleMatch('peanuts', ing('peanut_butter', 'peanut butter'))).toBe(false);
    expect(isPlausibleMatch('coconut milk', ing('milk', 'milk'))).toBe(false);
  });

  it('never swaps one describing word for another', () => {
    expect(isPlausibleMatch('black beans', ing('white_bean', 'white bean', 'white beans'))).toBe(
      false,
    );
    expect(isPlausibleMatch('black pepper', ing('green_pepper', 'green pepper'))).toBe(false);
    expect(isPlausibleMatch('brown rice', ing('white_rice', 'white rice'))).toBe(false);
    expect(isPlausibleMatch('frozen peas', ing('snow_pea', 'snow pea'))).toBe(false);
  });

  it('lets a described item drop its own describing words', () => {
    expect(isPlausibleMatch('black beans', ing('bean', 'bean', 'beans'))).toBe(true);
    expect(isPlausibleMatch('brown rice', ing('brown_rice', 'brown rice'))).toBe(true);
  });

  it('falls back to the main word when the full name finds nothing', async () => {
    const tomato = ing('tomato', 'tomato', 'tomatoes');
    const search = jest.fn(async (text: string) => (text === 'tomato' ? [tomato] : []));
    await expect(matchIngredient('Cherry tomatoes', search)).resolves.toBe(tomato);
    expect(search.mock.calls.map(([text]) => text)).toEqual(['cherry tomato', 'tomato']);
  });

  it('skips implausible search results instead of taking the first one', async () => {
    const butter = ing('butter', 'butter');
    const search = jest.fn(async () => [butter]);
    await expect(matchIngredient('Peanut butter', search)).resolves.toBeNull();
  });

  it('looks each distinct food up once', async () => {
    const egg = ing('egg', 'egg', 'eggs');
    const search = jest.fn(async (text: string) => (text === 'egg' ? [egg] : []));
    const matches = await matchIngredients(['Eggs', 'egg', 'Mystery jar', '!!'], search);
    expect(matches.get('egg')).toBe(egg);
    expect(matches.get('mystery')).toBeNull();
    expect(matches.size).toBe(2);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
