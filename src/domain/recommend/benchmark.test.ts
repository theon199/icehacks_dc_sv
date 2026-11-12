/**
 * Ranking must stay fast enough to run on the JS thread when the Discover tab opens: the target is
 * 2,000 candidates in under 30 ms on a laptop. CI machines and Jest instrumentation are slower and
 * noisier, so the assertion uses a generous ceiling; set FAMARA_STRICT_BENCH=1 to check the real
 * target locally.
 */
import { buildDeck } from './deck';
import { syntheticCatalog } from './fixtures/synthetic';
import { createRandom } from './random';
import { rankRecipes } from './rank';
import { DAY_MS } from './taste';
import { type FeedbackEvent, type Impression } from '../types/feedback';
import { userPreferencesSchema } from '../types/preferences';

const TARGET_MS = 30;
const CEILING_MS = process.env.FAMARA_STRICT_BENCH === '1' ? TARGET_MS : 150;
const CANDIDATES = 2000;
const NOW = Date.UTC(2026, 10, 1);

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function time(run: () => void, repeats = 9) {
  for (let i = 0; i < 3; i++) run();
  const samples: number[] = [];
  for (let i = 0; i < repeats; i++) {
    // hrtime rather than performance.now: the test environment's clock has millisecond resolution.
    const start = process.hrtime.bigint();
    run();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return median(samples);
}

describe('ranking performance', () => {
  const candidates = syntheticCatalog(CANDIDATES, 'benchmark-catalog');
  const random = createRandom('benchmark-history');
  const feedback: FeedbackEvent[] = Array.from({ length: 300 }, (_, i) => ({
    recipeId: candidates[Math.floor(random() * CANDIDATES)]!.id,
    kind: (['like', 'save', 'cooked', 'pass', 'not_for_me'] as const)[i % 5]!,
    at: NOW - Math.floor(random() * 90) * DAY_MS,
    reasons: i % 5 === 4 ? ['dislike_ingredient', 'too_long'] : [],
  }));
  const shown: Impression[] = Array.from({ length: 200 }, (_, i) => ({
    recipeId: candidates[i * 7]!.id,
    at: NOW - (i % 10) * DAY_MS,
  }));
  const pantry = Array.from({ length: 60 }, (_, i) => `ingredient_${i * 3}`);
  const prefs = userPreferencesSchema.parse({
    cuisines: ['indian', 'thai', 'mexican', 'italian'],
    allergens: ['peanut'],
    diets: [],
    goals: ['more_protein', 'heart_friendly'],
    timeBudgetMinutes: 30,
    effort: 2,
  });
  const input = { prefs, now: NOW, feedback, shown, pantry };

  it(`ranks ${CANDIDATES} candidates within the budget`, () => {
    const ms = time(() => {
      rankRecipes(candidates, input);
    });

    console.info(`rankRecipes(${CANDIDATES}): ${ms.toFixed(2)} ms median`);
    expect(ms).toBeLessThan(CEILING_MS);
  });

  it(`builds a deck from ${CANDIDATES} candidates within the budget`, () => {
    const ms = time(() => {
      buildDeck({ ...input, candidates, mode: 'forYou', seed: 'bench', size: 20 });
    });

    console.info(`buildDeck(${CANDIDATES}): ${ms.toFixed(2)} ms median`);
    expect(ms).toBeLessThan(CEILING_MS);
    const deck = buildDeck({ ...input, candidates, mode: 'forYou', seed: 'bench', size: 20 });
    expect(deck.cards).toHaveLength(20);
  });
});
