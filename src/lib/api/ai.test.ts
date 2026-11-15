import {
  AI_TIMEOUTS_MS,
  type ChefRequest,
  createAiApi,
  isAiAgeRestricted,
  isAiQuotaExceeded,
  isAiRefused,
} from './ai';
import { createApiClient } from './client';
import { ApiError } from './errors';

interface Sent {
  url: string;
  body: unknown;
}

function setup(reply: (url: string) => Response) {
  const sent: Sent[] = [];
  const call = createApiClient({
    baseUrl: 'https://proj.supabase.co',
    publishableKey: 'sb_publishable_key',
    getAccessToken: async () => 'user-token',
    fetch: async (input, init) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return reply(String(input));
    },
  });
  return { api: createAiApi(call), sent };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const quota = { remaining: 4, reset_at: '2026-11-12T00:00:00.000Z' };

const chefRequest: ChefRequest = {
  messages: [{ role: 'user', content: 'Something quick with lentils?' }],
  profile: {
    cuisines: ['indian'],
    diet: [],
    allergens: ['peanut'],
    goals: ['more_fiber'],
    time_budget_minutes: 30,
    small_appetite: false,
  },
  candidates: [
    {
      id: 'mealdb:1',
      title: 'Red Lentil Dal',
      cuisine: 'indian',
      minutes: 25,
      kcal: 380,
      protein_g: 19,
      tags: [],
    },
  ],
};

describe('aiApi', () => {
  it('asks Chef and keeps only recipe ids the device offered', async () => {
    const { api, sent } = setup(() =>
      json({
        reply: 'Try the **Red Lentil Dal**.',
        recipe_ids: ['mealdb:1', 'mealdb:999'],
        follow_ups: ['Can I freeze it?'],
        quota,
      }),
    );
    const result = await api.askChef(chefRequest);
    expect(result.recipe_ids).toEqual(['mealdb:1']);
    expect(result.quota.remaining).toBe(4);
    expect(sent[0]?.url).toBe('https://proj.supabase.co/functions/v1/chef');
    expect(sent[0]?.body).toEqual(chefRequest);
  });

  it('parses every Snap outcome', async () => {
    const replies = [
      {
        status: 'ok',
        mode: 'pantry',
        items: [{ name: 'red onion', quantity: 3, unit: 'piece', confidence: 0.9 }],
        quota,
      },
      {
        status: 'ok',
        mode: 'dish',
        dish: {
          name: 'Shakshuka',
          cuisine: 'middle eastern',
          key_ingredients: ['eggs', 'tomato'],
          portion: 'one pan, about 350 g',
          nutrition: Object.fromEntries(
            ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg'].map((key) => [
              key,
              { estimate: 10, low: 5, high: 15 },
            ]),
          ),
          nutrition_confidence: 'estimated',
          confidence: 0.8,
        },
        quota,
      },
      {
        status: 'no_food',
        mode: 'dish',
        reason: 'not_food',
        message: 'No food here.',
        quota,
      },
    ];
    const { api, sent } = setup(() => json(replies.shift()));
    const pantry = await api.readSnap({ mode: 'pantry', image: 'AAAA' });
    expect(pantry.status === 'ok' && pantry.mode === 'pantry' && pantry.items[0]?.unit).toBe(
      'piece',
    );
    const dish = await api.readSnap({ mode: 'dish', image: 'AAAA' });
    expect(dish.status === 'ok' && dish.mode === 'dish' && dish.dish.name).toBe('Shakshuka');
    const none = await api.readSnap({ mode: 'dish', image: 'AAAA' });
    expect(none.status).toBe('no_food');
    expect(sent.map((request) => request.url.split('/').pop())).toEqual(['snap', 'snap', 'snap']);
  });

  it('sends sweep batches and dictated text through snap', async () => {
    const { api, sent } = setup(() =>
      json({
        status: 'ok',
        mode: 'pantry',
        items: [{ name: 'Paneer', quantity: 1, unit: 'pack', confidence: 0.9 }],
        quota,
      }),
    );
    const sweepId = '3f1c2b9e-6a0d-4f6e-9b5a-1c2d3e4f5a6b';
    await api.readSnap({ mode: 'pantry', sweep_id: sweepId, images: ['AAAA', 'BBBB'] });
    await api.readSnap({ mode: 'pantry', sweep_id: sweepId, text: 'paneer in the freezer' });
    expect(sent.map((request) => request.body)).toEqual([
      { mode: 'pantry', sweep_id: sweepId, images: ['AAAA', 'BBBB'] },
      { mode: 'pantry', sweep_id: sweepId, text: 'paneer in the freezer' },
    ]);
  });

  it('parses both recipe import outcomes', async () => {
    let call = 0;
    const { api, sent } = setup(() => {
      call += 1;
      return call === 1
        ? json({
            status: 'ok',
            recipe: {
              title: "Mom's chicken adobo",
              servings: 4,
              total_minutes: 45,
              cuisine: 'filipino',
              meal: 'dinner',
              ingredients: [{ text: '1/3 cup cane vinegar', name: 'cane vinegar' }],
              steps: ['Simmer everything for 30 minutes.'],
              source_url: null,
            },
            quota,
          })
        : json({ status: 'not_recipe', reason: 'no_recipe', message: 'No recipe here.', quota });
    });
    const ok = await api.importRecipe({ source: 'text', text: 'Adobo: chicken, vinegar...' });
    expect(ok.status === 'ok' && ok.recipe.ingredients[0]?.name).toBe('cane vinegar');
    const none = await api.importRecipe({ source: 'link', url: 'https://example.com/about' });
    expect(none.status).toBe('not_recipe');
    expect(sent.map((request) => request.url.split('/').pop())).toEqual([
      'recipe-import',
      'recipe-import',
    ]);
  });

  it('asks the coach and parses where the answer points', async () => {
    const { api, sent } = setup(() =>
      json({
        verdict: 'not_yet',
        answer: 'Some garam masala on the left has not mixed in. A few more stirs.',
        focus: { x: 0.3, y: 0.4, r: 0.1 },
        quota,
      }),
    );
    const reply = await api.askCoach({
      recipe: {
        id: 'mealdb:52865',
        title: 'Matar Paneer',
        step_index: 1,
        step_count: 3,
        step: 'Stir in the paneer and sprinkle over the garam masala.',
      },
      question: 'Is this stirred enough?',
      image: 'AAAA',
      diet: [],
      allergens: [],
    });
    expect(reply.verdict).toBe('not_yet');
    expect(reply.focus?.x).toBe(0.3);
    expect(sent[0]?.url.endsWith('/coach')).toBe(true);
  });

  it('sends the recipe facts and accepts an answer that spent no question', async () => {
    const { api, sent } = setup(() =>
      json({
        verdict: 'unsure',
        answer: "I can't tell if poultry is cooked through by looking.",
        focus: null,
        quota: null,
      }),
    );
    const reply = await api.askCoach({
      recipe: { id: 'r1', title: 'Chicken sausages', step_index: 0, step_count: 1, step: 'Brown' },
      question: 'Is it done?',
      diet: [],
      allergens: [],
      facts: { safety: ['poultry', 'minced_meat'], plant_only: false },
    });
    expect(reply.quota).toBeNull();
    expect(sent[0]?.body).toMatchObject({
      facts: {
        safety: ['poultry', 'minced_meat'],
        plant_only: false,
      },
    });
  });

  it('answers the coach faster than other AI calls', () => {
    expect(AI_TIMEOUTS_MS.coach).toBeLessThan(AI_TIMEOUTS_MS.snap);
  });

  describe('checks requests before sending them', () => {
    const neverCalled = () => {
      throw new Error('the request should not reach the network');
    };
    const sweepId = '3f1c2b9e-6a0d-4f6e-9b5a-1c2d3e4f5a6b';
    const step = {
      id: 'mealdb:52865',
      title: 'Matar Paneer',
      step_index: 1,
      step_count: 3,
      step: 'Stir in the paneer.',
    };

    async function rejected(send: () => Promise<unknown>) {
      const error = await send().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('validation');
      expect((error as ApiError).retryable).toBe(false);
    }

    it('refuses a sweep batch with too many frames or a bad sweep id', async () => {
      const { api, sent } = setup(neverCalled);
      await rejected(() =>
        api.readSnap({ mode: 'pantry', sweep_id: sweepId, images: ['A', 'B', 'C', 'D'] }),
      );
      await rejected(() => api.readSnap({ mode: 'pantry', sweep_id: 'not-a-uuid', images: ['A'] }));
      await rejected(() => api.readSnap({ mode: 'pantry', sweep_id: sweepId, images: [] }));
      await rejected(() => api.readSnap({ mode: 'pantry', text: 'x'.repeat(601) }));
      expect(sent).toHaveLength(0);
    });

    it('refuses recipe links that are not http(s)', async () => {
      const { api, sent } = setup(neverCalled);
      await rejected(() => api.importRecipe({ source: 'link', url: 'javascript:alert(1)' }));
      await rejected(() => api.importRecipe({ source: 'link', url: 'ftp://example.com/r' }));
      await rejected(() => api.importRecipe({ source: 'text', text: '   ' }));
      expect(sent).toHaveLength(0);
    });

    it('refuses an oversized coach question and a step past the end', async () => {
      const { api, sent } = setup(neverCalled);
      await rejected(() =>
        api.askCoach({ recipe: step, question: 'q'.repeat(301), diet: [], allergens: [] }),
      );
      await rejected(() =>
        api.askCoach({
          recipe: { ...step, step_index: 9, step_count: 1 },
          question: 'Is this done?',
          diet: [],
          allergens: [],
        }),
      );
      expect(sent).toHaveLength(0);
    });

    it('still sends requests within the bounds', async () => {
      const { api, sent } = setup(() => json({ status: 'ok', mode: 'pantry', items: [], quota }));
      await api.readSnap({ mode: 'pantry', sweep_id: sweepId, images: ['A', 'B', 'C'] });
      expect(sent).toHaveLength(1);
    });
  });

  it('rejects a response that does not match the contract', async () => {
    const { api } = setup(() => json({ tips: ['only one'], quota }));
    const error = await api
      .nearbyTips({ dish: { name: 'Pho' }, places: [], goals: [], diet: [], allergens: [] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('invalid_response');
  });

  it('calls nearby-chat and makeover by their function names', async () => {
    const { api, sent } = setup((url) =>
      url.endsWith('/nearby-chat')
        ? json({ tips: ['Ask for sauce on the side.', 'Choose steamed rice.'], quota })
        : json({
            title: 'Lighter Dal',
            servings: 4,
            ingredients: ['1 cup red lentils'],
            steps: ['Simmer.'],
            swaps: [{ from: 'ghee', to: 'olive oil', why: 'Less saturated fat.' }],
            note: 'Same comfort, lighter.',
            quota,
          }),
    );
    const tips = await api.nearbyTips({
      dish: { name: 'Pho', cuisine: 'vietnamese' },
      places: [{ name: 'Pho House', cuisine: null, rating: 4.5 }],
      goals: [],
      diet: [],
      allergens: [],
    });
    expect(tips.tips).toHaveLength(2);
    const makeover = await api.makeover({
      recipe: { title: 'Dal', servings: 4, ingredients: ['1 cup lentils'], steps: ['Cook.'] },
      goals: ['lower_sat_fat'],
      diet: [],
      allergens: ['milk'],
    });
    expect(makeover.swaps[0]?.to).toBe('olive oil');
    expect(sent.map((request) => request.url.split('/').pop())).toEqual([
      'nearby-chat',
      'makeover',
    ]);
  });

  it('recognises AI-specific errors', async () => {
    const codes = [
      { status: 429, code: 'quota_exceeded', headers: { 'retry-after': '120' } },
      { status: 403, code: 'age_restricted', headers: {} },
      { status: 422, code: 'ai_refused', headers: {} },
    ];
    const { api } = setup(() => {
      const next = codes.shift()!;
      return json({ error: { code: next.code, message: 'nope' } }, next.status, next.headers);
    });
    const errors: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      errors.push(await api.askChef(chefRequest).catch((caught: unknown) => caught));
    }
    expect(isAiQuotaExceeded(errors[0])).toBe(true);
    expect((errors[0] as ApiError).retryAfterSeconds).toBe(120);
    expect(isAiAgeRestricted(errors[1])).toBe(true);
    expect(isAiRefused(errors[2])).toBe(true);
    expect(isAiRefused(new Error('plain'))).toBe(false);
  });

  it('gives AI calls longer timeouts than the default', () => {
    for (const timeout of Object.values(AI_TIMEOUTS_MS)) {
      expect(timeout).toBeGreaterThan(20_000);
    }
  });

  it('waits longer for a makeover than the server can spend on one', () => {
    // MAKEOVER_LIMITS.totalBudgetMs in supabase/functions/makeover/handler.ts: the first call plus
    // the allergen retry.
    const makeoverServerBudgetMs = 140_000;
    expect(AI_TIMEOUTS_MS.makeover).toBeGreaterThan(makeoverServerBudgetMs);
  });
});
