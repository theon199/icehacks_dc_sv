import { deckCard } from './__fixtures__/deckCard';
import { cardAccessibilityLabel, nutritionLine } from './cardText';

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
