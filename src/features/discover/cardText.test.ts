import { deckCard } from './__fixtures__/deckCard';
import {
  backIngredients,
  cardAccessibilityLabel,
  cardStats,
  matchText,
  nutritionLine,
} from './cardText';

const soup = { title: 'Lemon lentil soup', cuisine: 'italian', totalMinutes: 25 };

describe('card text', () => {
  it('summarises calories and protein per serving', () => {
    expect(nutritionLine(deckCard('c1', soup))).toBe('480 kcal · 24g protein per serving');
  });

  it('labels estimated nutrition and hides missing nutrition', () => {
    expect(nutritionLine(deckCard('c1', { nutritionConfidence: 'estimated' }))).toMatch(
      /\(estimated\)$/,
    );
    expect(
      nutritionLine(deckCard('c1', { nutritionConfidence: 'none', nutrition: null })),
    ).toBeNull();
  });

  it('lists time and per-serving stats, marking every estimated figure', () => {
    const computed = cardStats(deckCard('c1', soup));
    expect(computed[0]).toBe('25 min');
    expect(computed).toContain('480 kcal');
    expect(computed).toContain('24g protein');
    const estimated = cardStats(deckCard('c1', { ...soup, nutritionConfidence: 'estimated' }));
    expect(estimated.slice(1).every((stat) => stat.startsWith('Est. '))).toBe(true);
    expect(
      cardStats(deckCard('c1', { ...soup, nutritionConfidence: 'none', nutrition: null })),
    ).toEqual(['25 min']);
  });

  it('states the fit as a match percentage', () => {
    expect(matchText(deckCard('c1', soup))).toBe('82% match');
  });

  it('reads the whole card as one sentence with only the top two reasons', () => {
    const label = cardAccessibilityLabel(deckCard('c1', soup, 0.5));
    expect(label).toContain('Lemon lentil soup');
    expect(label).toContain('Italian cooking');
    expect(label).toContain('82% match');
    expect(label).toContain('Ready in 25 minutes');
    expect(label).not.toContain('Easy to make');
    expect(label).toContain('Half portion suggested');
  });

  it('lists the back ingredients in recipe order, marking what the pantry holds', () => {
    const ingredients = [
      { id: 'lentil', name: 'Lentils' },
      { id: 'lemon', name: 'Lemon' },
    ];
    const back = backIngredients(['lemon', 'missing', 'lentil'], ingredients, new Set(['lentil']));
    expect(back.items).toEqual([
      { id: 'lemon', name: 'Lemon', onHand: false },
      { id: 'lentil', name: 'Lentils', onHand: true },
    ]);
    expect(back.coverage).toBe('1 of 2 in your pantry');
  });

  it('claims no pantry coverage when the pantry is empty', () => {
    const back = backIngredients(['lemon'], [{ id: 'lemon', name: 'Lemon' }], new Set());
    expect(back.coverage).toBeNull();
    expect(back.items[0]?.onHand).toBe(false);
  });
});
