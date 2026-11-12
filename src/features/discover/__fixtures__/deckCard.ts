/** Builds a ready-made deck card for component and reducer tests. Test-only. */
import type { DeckCard } from '@/domain';

import { candidate } from './catalog';
import { toRankRecipe } from '../deps';

export function deckCard(
  id: string,
  overrides: Parameters<typeof candidate>[1] = {},
  portionScale = 1,
): DeckCard {
  return {
    recipe: toRankRecipe(candidate(id, overrides)),
    score: 0.7,
    fitScore: 82,
    features: {} as DeckCard['features'],
    reasons: [
      { code: 'goal', text: 'High in protein for your goal' },
      { code: 'time', text: 'Ready in 25 minutes' },
      { code: 'easy', text: 'Easy to make' },
    ],
    portionScale,
  };
}
