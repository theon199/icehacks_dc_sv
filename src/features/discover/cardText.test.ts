import { deckCard } from './__fixtures__/deckCard';
import { cardAccessibilityLabel, cardStats, nutritionLine } from './cardText';

const soup = { title: 'Lemon lentil soup', cuisine: 'italian', totalMinutes: 25 };

describe('card text', () => {
  it('summarises calories and protein per serving', () => {
    expect(nutritionLine(deckCard('c1', soup))).toBe('480 kcal · 24 g protein per serving');
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
    expect(computed).toContain('24 g protein');
    const estimated = cardStats(deckCard('c1', { ...soup, nutritionConfidence: 'estimated' }));
    expect(estimated.slice(1).every((stat) => stat.startsWith('Est. '))).toBe(true);
    expect(
      cardStats(deckCard('c1', { ...soup, nutritionConfidence: 'none', nutrition: null })),
    ).toEqual(['25 min']);
  });

  it('reads the whole card as one sentence with only the top two reasons', () => {
    const label = cardAccessibilityLabel(deckCard('c1', soup, 0.5));
    expect(label).toContain('Lemon lentil soup');
    expect(label).toContain('Italian cooking');
    expect(label).toContain('Fit score 82 out of 100');
    expect(label).toContain('Ready in 25 minutes');
    expect(label).not.toContain('Easy to make');
    expect(label).toContain('Half portion suggested');
  });
});
