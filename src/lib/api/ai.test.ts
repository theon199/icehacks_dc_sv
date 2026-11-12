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
