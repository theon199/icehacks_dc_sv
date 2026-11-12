import { deckCard } from './__fixtures__/deckCard';
import { continueRun, type RunRules } from './deckRun';

const RULES: RunRules = { cuisineCap: 2, regionCap: 3, window: 6 };

const ids = (cards: readonly { recipe: { id: string } }[]) => cards.map((card) => card.recipe.id);

describe('continueRun', () => {
  it('keeps the engine order when the seam is already varied', () => {
    const tail = [deckCard('a', { cuisine: 'italian' }), deckCard('b', { cuisine: 'mexican' })];
    const fresh = [deckCard('c', { cuisine: 'japanese' }), deckCard('d', { cuisine: 'indian' })];
    expect(ids(continueRun(tail, fresh, RULES))).toEqual(['c', 'd']);
  });

  it('holds back a cuisine the queued cards already use up', () => {
    const tail = [deckCard('a', { cuisine: 'italian' }), deckCard('b', { cuisine: 'italian' })];
    const fresh = [
      deckCard('c', { cuisine: 'italian' }),
      deckCard('d', { cuisine: 'mexican' }),
      deckCard('e', { cuisine: 'japanese' }),
      deckCard('f', { cuisine: 'indian' }),
      deckCard('g', { cuisine: 'american' }),
    ];
    // Italian may return once the two queued Italian dishes leave the six-card window.
    expect(ids(continueRun(tail, fresh, RULES))).toEqual(['d', 'e', 'f', 'g', 'c']);
  });

  it('drops a variant of a dish that is already queued', () => {
    const tail = [deckCard('a', { familyId: 'stew' })];
    const fresh = [deckCard('b', { familyId: 'stew' }), deckCard('c', { familyId: 'salad' })];
    expect(ids(continueRun(tail, fresh, RULES))).toEqual(['c']);
  });

  it('relaxes the caps rather than losing cards when nothing else fits', () => {
    const tail = [deckCard('a', { cuisine: 'italian' }), deckCard('b', { cuisine: 'italian' })];
    const fresh = [deckCard('c', { cuisine: 'italian' }), deckCard('d', { cuisine: 'italian' })];
    expect(ids(continueRun(tail, fresh, RULES))).toEqual(['c', 'd']);
  });

  it('applies the region cap too', () => {
    // Three different cuisines from one region already queued.
    const tail = ['a', 'b', 'c'].map((id) =>
      deckCard(id, { cuisine: id, region: 'latin_america' }),
    );
    const fresh = [
      deckCard('d', { cuisine: 'mexican', region: 'latin_america' }),
      deckCard('e', { cuisine: 'japanese' }),
    ];
    expect(ids(continueRun(tail, fresh, RULES))).toEqual(['e', 'd']);
  });
});
