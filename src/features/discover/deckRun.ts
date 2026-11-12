/**
 * Keeps a deck varied where one fill meets the next. Each fill is diversified on its own by the
 * engine, so without this the first cards of a refill could repeat the cuisine, region or dish of
 * the cards still waiting above them.
 */
import { DEFAULT_RANKING_CONFIG, type DeckCard, type RankingConfig } from '@/domain';

export type RunRules = Pick<RankingConfig['diversity'], 'cuisineCap' | 'regionCap' | 'window'>;

export const RUN_RULES: RunRules = DEFAULT_RANKING_CONFIG.diversity;

function countRecent(
  run: readonly DeckCard[],
  span: number,
  key: 'cuisine' | 'region',
  value: string,
): number {
  let count = 0;
  for (let i = Math.max(0, run.length - span); i < run.length; i++) {
    if (run[i]!.recipe[key] === value) count++;
  }
  return count;
}

/**
 * Orders `fresh` to follow `tail` (the cards already queued, top first): variants of a dish
 * already in the tail are dropped, and each slot takes the earliest fresh card that keeps the
 * cuisine and region caps over the last `window` cards. When nothing fits, the region cap is
 * relaxed first, then the cuisine cap, so cards are reordered but never lost.
 */
export function continueRun(
  tail: readonly DeckCard[],
  fresh: readonly DeckCard[],
  rules: RunRules = RUN_RULES,
): DeckCard[] {
  const families = new Set(tail.map((card) => card.recipe.familyId));
  const remaining = fresh.filter((card) => {
    if (families.has(card.recipe.familyId)) return false;
    families.add(card.recipe.familyId);
    return true;
  });
  const span = rules.window - 1;
  const run = tail.slice(-span);
  const out: DeckCard[] = [];

  const fits = (card: DeckCard, regionCap: boolean) =>
    countRecent(run, span, 'cuisine', card.recipe.cuisine) < rules.cuisineCap &&
    (!regionCap || countRecent(run, span, 'region', card.recipe.region) < rules.regionCap);

  while (remaining.length > 0) {
    let index = remaining.findIndex((card) => fits(card, true));
    if (index < 0) index = remaining.findIndex((card) => fits(card, false));
    if (index < 0) index = 0;
    const [card] = remaining.splice(index, 1);
    out.push(card!);
    run.push(card!);
  }
  return out;
}
