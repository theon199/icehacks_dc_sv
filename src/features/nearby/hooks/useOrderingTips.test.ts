import { buildTipsRequest, tipsProfileKey } from './useOrderingTips';
import { toPlaceView } from '../model/placeView';

const place = (i: number) =>
  toPlaceView(
    {
      id: `p${i}`,
      name: `Place ${i}`,
      address: null,
      lat: 1,
      lng: 1,
      distanceM: 100,
      rating: i % 2 === 0 ? 4.2 : null,
      ratingCount: null,
      priceLevel: null,
      openNow: null,
      primaryType: i % 2 === 0 ? 'vietnamese_restaurant' : null,
      yesCount: 0,
      noCount: 0,
      myAnswer: null,
    },
    null,
    'metric',
  );

describe('buildTipsRequest', () => {
  const dish = { name: 'Pho', key: 'pho', cuisine: 'south_east_asian', recipeId: null };

  it('sends the dish, up to 20 places and the profile', () => {
    const request = buildTipsRequest(
      dish,
      Array.from({ length: 25 }, (_, i) => place(i)),
      { goals: ['lower_sodium'], diets: ['vegetarian'], allergens: ['peanut'] },
    );
    expect(request.dish).toEqual({ name: 'Pho', cuisine: 'south east asian' });
    expect(request.places).toHaveLength(20);
    expect(request.places[0]).toEqual({
      name: 'Place 0',
      cuisine: 'Vietnamese restaurant',
      rating: 4.2,
    });
    expect(request.places[1]).toEqual({ name: 'Place 1', cuisine: null, rating: null });
    expect(request).toMatchObject({
      goals: ['lower_sodium'],
      diet: ['vegetarian'],
      allergens: ['peanut'],
    });
  });

  it('sends the numeric rating, never a parse of the display label', () => {
    // A label written for a comma-decimal locale must not turn into NaN on the way out.
    const localised = { ...place(0), rating: '4,2' };
    expect(
      buildTipsRequest(dish, [localised], { goals: [], diets: [], allergens: [] }).places,
    ).toEqual([{ name: 'Place 0', cuisine: 'Vietnamese restaurant', rating: 4.2 }]);
  });

  it('drops values the function would reject', () => {
    const request = buildTipsRequest({ ...dish, cuisine: null }, [], {
      goals: ['Lower Sodium', 'more_fiber'],
      diets: ['9lives'],
      allergens: ['peanut', 'peanut', 'mustard'],
    });
    expect(request.dish).toEqual({ name: 'Pho' });
    expect(request.goals).toEqual(['more_fiber']);
    expect(request.diet).toEqual([]);
    expect(request.allergens).toEqual(['peanut']);
  });
});

describe('tipsProfileKey', () => {
  const base = { goals: ['lower_sodium'], diets: ['vegetarian'], allergens: ['peanut'] };

  it('changes when an allergen is added, so earlier tips are not reused', () => {
    expect(tipsProfileKey({ ...base, allergens: ['peanut', 'sesame'] })).not.toBe(
      tipsProfileKey(base),
    );
  });

  it('ignores the order preferences were picked in', () => {
    expect(tipsProfileKey({ ...base, allergens: ['sesame', 'peanut'] })).toBe(
      tipsProfileKey({ ...base, allergens: ['peanut', 'sesame'] }),
    );
  });
});
