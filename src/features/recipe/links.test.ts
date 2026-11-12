import { recipeNearbyHref } from './links';

describe('recipeNearbyHref', () => {
  it('sends the recipe id, not its title, so Nearby can read the cuisine too', () => {
    expect(recipeNearbyHref('mealdb:52772')).toBe('/nearby/mealdb%3A52772');
  });

  it('keeps ids with unusual characters intact through the route', () => {
    const href = recipeNearbyHref('famara:pad-thai_lighter');
    expect(typeof href).toBe('string');
    expect(decodeURIComponent(String(href).replace('/nearby/', ''))).toBe(
      'famara:pad-thai_lighter',
    );
  });
});
