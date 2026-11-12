import { composeHref } from './deps';

describe('composeHref', () => {
  it('passes the cook as a draft for the community composer', () => {
    expect(
      composeHref({
        recipeId: 'mealdb:1',
        rating: 5,
        note: '  More garlic  ',
        photo: { uri: 'file:///cache/dish.jpg', width: 1600, height: 1200 },
      }),
    ).toEqual({
      pathname: '/compose',
      params: {
        recipe: 'mealdb:1',
        from: 'cook',
        rating: '5',
        note: 'More garlic',
        photo: 'file:///cache/dish.jpg',
        photoWidth: '1600',
        photoHeight: '1200',
      },
    });
  });

  it('leaves out what the cook did not fill in', () => {
    expect(composeHref({ recipeId: 'mealdb:1', rating: null, note: ' ', photo: null })).toEqual({
      pathname: '/compose',
      params: { recipe: 'mealdb:1', from: 'cook' },
    });
  });
});
