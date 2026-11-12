import { conflictNotice } from './conflictNotice';

describe('conflictNotice', () => {
  it('names a single allergen', () => {
    expect(conflictNotice(['milk']).title).toBe('That version still had milk');
  });

  it('names several allergens once each, in a readable list', () => {
    expect(conflictNotice(['milk', 'tree_nut', 'milk', 'egg']).title).toBe(
      'That version still had milk, tree nuts and egg',
    );
    expect(conflictNotice(['peanut', 'sesame']).title).toBe(
      'That version still had peanuts and sesame',
    );
  });

  it('stays general when the server named no allergen Famara knows', () => {
    expect(conflictNotice([]).title).toBe('That version still had one of your allergens');
  });

  it('always suggests what to do next', () => {
    expect(conflictNotice(['soy']).message).toMatch(/Try again/);
  });
});
