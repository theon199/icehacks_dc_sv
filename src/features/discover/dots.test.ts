import { deckDots, MAX_DECK_DOTS } from './dots';

describe('deckDots', () => {
  it('draws one dot per card while they fit', () => {
    expect(deckDots(3)).toMatchObject({ remaining: 3, dots: 3, overflow: 0 });
  });

  it('states the cards past the cap as a count instead of dropping them', () => {
    expect(deckDots(12)).toMatchObject({ dots: MAX_DECK_DOTS, overflow: 12 - MAX_DECK_DOTS });
  });

  it('draws nothing for an empty deck', () => {
    expect(deckDots(0)).toMatchObject({ remaining: 0, dots: 0, overflow: 0 });
    expect(deckDots(-2).remaining).toBe(0);
  });

  it('reads the honest count aloud', () => {
    expect(deckDots(1).accessibilityLabel).toBe('1 recipe lined up');
    expect(deckDots(9).accessibilityLabel).toBe('9 recipes lined up');
  });
});
