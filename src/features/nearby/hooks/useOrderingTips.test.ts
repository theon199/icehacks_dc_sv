import { buildTipsRequest } from './useOrderingTips';
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
