import { cleanCuisineIds, cuisineLabel, toggleCuisine } from './cuisines';

describe('cuisineLabel', () => {
  it.each([
    ['indian', 'Indian'],
    ['west_african', 'West African'],
    ['middle__eastern', 'Middle Eastern'],
  ])('%s → %s', (id, label) => {
    expect(cuisineLabel(id)).toBe(label);
  });
});

describe('cleanCuisineIds', () => {
  it('drops invalid and repeated ids', () => {
    expect(cleanCuisineIds(['thai', 'Thai', 'thai', ' indian ', '9x', ''])).toEqual(['thai', 'indian']);
  });
});

describe('toggleCuisine', () => {
  it('adds and removes', () => {
    expect(toggleCuisine(['thai'], 'indian')).toEqual(['thai', 'indian']);
    expect(toggleCuisine(['thai', 'indian'], 'thai')).toEqual(['indian']);
  });

  it('stops at the limit', () => {
    const full = ['a', 'b'];
    expect(toggleCuisine(full, 'c', 2)).toBe(full);
  });
});
