import {
  appendMessage,
  chefSync,
  createThread,
  MAX_MESSAGES_PER_THREAD,
  MAX_THREAD_JSON_CHARS,
  MAX_THREADS,
  selectThreadList,
  trimThreads,
  useChefStore,
} from './chef';
import {
  logCook,
  selectCookEntries,
  selectLastCookedAt,
  trimEntries,
  useCookLogStore,
} from './cookLog';
import {
  feedbackSync,
  MAX_FEEDBACK_EVENTS,
  recordEvents,
  selectFeedbackEvents,
  useFeedbackStore,
  type FeedbackEvent,
} from './feedback';
import {
  saveRecipe,
  savedSync,
  selectIsSaved,
  selectSavedIds,
  unsaveRecipe,
  useSavedStore,
} from './saved';
import {
  selectAiConsentHint,
  settingsSync,
  updateSettings,
  defaultSettings,
  useSettingsStore,
} from './settings';
import {
  clearChecked,
  selectCheckedKeys,
  setChecked,
  shoppingLineKey,
  useShoppingStore,
} from './shopping';

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const at = (minute: number) => new Date(Date.UTC(2026, 10, 11, 10, minute)).toISOString();

describe('saved recipes', () => {
  beforeEach(() => useSavedStore.getState().reset());

  it('saves once, unsaves, and lists newest first', () => {
    let saved = saveRecipe({}, 'r1', at(1));
    expect(saveRecipe(saved, 'r1', at(5))).toBe(saved);
    saved = saveRecipe(saved, 'r2', at(2));
    expect(selectSavedIds({ saved } as never)).toEqual(['r2', 'r1']);
    expect(unsaveRecipe(saved, 'nope')).toBe(saved);
    expect(Object.keys(unsaveRecipe(saved, 'r1'))).toEqual(['r2']);
  });

  it('toggles through the store and syncs one document per recipe', () => {
    expect(useSavedStore.getState().toggle('mealdb:1', at(1))).toBe(true);
    expect(selectIsSaved('mealdb:1')(useSavedStore.getState())).toBe(true);
    expect([...savedSync.getDocs().keys()]).toEqual(['mealdb:1']);
    expect(useSavedStore.getState().toggle('mealdb:1')).toBe(false);
    expect(savedSync.getDocs().size).toBe(0);
  });
});

describe('feedback events', () => {
  beforeEach(() => useFeedbackStore.getState().reset());

  const event = (i: number): FeedbackEvent & { id: string } => ({
    id: `e${String(i).padStart(5, '0')}`,
    recipeId: `r${i}`,
    kind: 'like',
    reason: null,
    ingredientId: null,
    at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
  });

  it('keeps only the newest 2,000 events', () => {
    const inputs = Array.from({ length: MAX_FEEDBACK_EVENTS + 5 }, (_, i) => event(i));
    const events = recordEvents({}, inputs);
    expect(Object.keys(events)).toHaveLength(MAX_FEEDBACK_EVENTS);
    expect(events.e00000).toBeUndefined();
    expect(events[`e${String(MAX_FEEDBACK_EVENTS + 4).padStart(5, '0')}`]).toBeDefined();
  });

  it('ignores invalid and duplicate events', () => {
    const events = recordEvents({}, [event(1)]);
    expect(recordEvents(events, [event(1)])).toBe(events);
    expect(recordEvents(events, [{ ...event(2), kind: 'meh' as never }])).toBe(events);
  });

  it('records through the store with reasons and trims merged remote events', () => {
    useFeedbackStore
      .getState()
      .record({ recipeId: 'r1', kind: 'not_for_me', reason: 'too_long' }, at(1));
    const [only] = selectFeedbackEvents(useFeedbackStore.getState());
    expect(only).toMatchObject({ reason: 'too_long', ingredientId: null });

    const remote = Array.from({ length: MAX_FEEDBACK_EVENTS }, (_, i) => event(i + 10));
    feedbackSync.applyRemote({
      upserts: remote.map((data) => ({ docId: data.id, data })),
      deletes: [],
    });
    const state = useFeedbackStore.getState();
    expect(Object.keys(state.events)).toHaveLength(MAX_FEEDBACK_EVENTS);
    // The local event from November is newer than all remote ones, so it survives the trim.
    expect(state.events[only?.id as string]).toBeDefined();
  });
});

describe('cook log', () => {
  beforeEach(() => useCookLogStore.getState().reset());

  it('logs, validates, and reports the latest cook per recipe', () => {
    let entries = logCook(
      {},
      { recipeId: 'r1', rating: 4, notes: '  less salt ' },
      { id: 'a', at: at(1) },
    );
    expect(entries.a?.notes).toBe('less salt');
    expect(logCook(entries, { recipeId: 'r1', rating: 9 }, { id: 'b', at: at(2) })).toBe(entries);
    entries = logCook(entries, { recipeId: 'r1' }, { id: 'c', at: at(3) });
    const state = { entries } as never;
    expect(selectCookEntries(state).map((e) => e.id)).toEqual(['c', 'a']);
    expect(selectLastCookedAt(state)).toEqual({ r1: at(3) });
    expect(Object.keys(trimEntries(entries, 1))).toEqual(['c']);
  });

  it('returns the id of a logged entry from the store', () => {
    const id = useCookLogStore.getState().log({ recipeId: 'r1', wouldCookAgain: true });
    expect(id && useCookLogStore.getState().entries[id]?.wouldCookAgain).toBe(true);
    expect(useCookLogStore.getState().log({ recipeId: '' })).toBeNull();
  });
});

describe('shopping check-offs', () => {
  beforeEach(() => useShoppingStore.getState().reset());

  it('builds stable keys per ingredient and unit', () => {
    expect(shoppingLineKey({ ingredientId: 'milk', name: 'Milk', unit: 'Cup' })).toBe('milk|cup');
    expect(shoppingLineKey({ name: '  Fresh   Basil ' })).toBe('fresh basil');
  });

  it('ticks, unticks and clears', () => {
    let checks = setChecked({}, 'milk|cup', true, at(1));
    expect(setChecked(checks, 'milk|cup', true, at(2))).toBe(checks);
    checks = setChecked(checks, 'eggs', true, at(2));
    expect(Object.keys(clearChecked(checks, ['eggs']))).toEqual(['milk|cup']);
    expect(clearChecked(checks)).toEqual({});
    expect(clearChecked({})).toEqual({});

    useShoppingStore.getState().toggle('eggs');
    expect(selectCheckedKeys(useShoppingStore.getState()).has('eggs')).toBe(true);
    useShoppingStore.getState().toggle('eggs');
    expect(selectCheckedKeys(useShoppingStore.getState()).size).toBe(0);
  });
});

describe('chef threads', () => {
  beforeEach(() => useChefStore.getState().reset());

  it('titles a thread from its first question and orders by activity', () => {
    let threads = createThread({}, { id: 't1', at: at(1) });
    threads = createThread(threads, { id: 't2', at: at(2), title: 'Dinner ideas' });
    threads = appendMessage(threads, 't1', {
      id: 'm1',
      role: 'user',
      text: 'What can I make with chickpeas?',
      at: at(3),
    });
    expect(threads.t1?.title).toBe('What can I make with chickpeas?');
    expect(selectThreadList({ threads } as never).map((t) => t.id)).toEqual(['t1', 't2']);
    expect(
      appendMessage(threads, 'missing', { id: 'm2', role: 'user', text: 'hi', at: at(4) }),
    ).toBe(threads);
  });

  it('bounds messages per thread, thread size and thread count', () => {
    let threads = createThread({}, { id: 't', at: at(0) });
    for (let i = 0; i < MAX_MESSAGES_PER_THREAD + 10; i += 1) {
      threads = appendMessage(threads, 't', {
        id: `m${i}`,
        role: 'assistant',
        text: 'x'.repeat(2000),
        at: at(1),
      });
    }
    const thread = threads.t;
    expect(thread?.messages.length).toBeLessThanOrEqual(MAX_MESSAGES_PER_THREAD);
    expect(JSON.stringify(thread).length).toBeLessThanOrEqual(MAX_THREAD_JSON_CHARS);
    expect(thread?.messages.at(-1)?.id).toBe(`m${MAX_MESSAGES_PER_THREAD + 9}`);

    let many = {};
    for (let i = 0; i < MAX_THREADS + 3; i += 1)
      many = createThread(many, { id: `t${i}`, at: at(i) });
    expect(Object.keys(trimThreads(many))).toHaveLength(MAX_THREADS);
    expect(Object.keys(many)).not.toContain('t0');
  });

  it('syncs one document per thread', () => {
    const id = useChefStore.getState().startThread();
    useChefStore.getState().append(id, { role: 'user', text: 'Hello' });
    expect(chefSync.getDocs().get(id)).toMatchObject({ title: 'Hello' });
    chefSync.applyRemote({ upserts: [], deletes: [id] });
    expect(useChefStore.getState().threads).toEqual({});
  });
});

describe('settings', () => {
  beforeEach(() => useSettingsStore.getState().reset());

  it('merges notification changes and keeps identity when unchanged', () => {
    expect(updateSettings(defaultSettings, { units: 'us' })).toBe(defaultSettings);
    const next = updateSettings(defaultSettings, { notifications: { social: true } });
    expect(next.notifications).toEqual({ ...defaultSettings.notifications, social: true });
  });

  it('keeps the AI consent hint out of the synced document', () => {
    useSettingsStore.getState().rememberAiConsent(true, at(1));
    useSettingsStore.getState().setUnits('metric');
    expect(selectAiConsentHint(useSettingsStore.getState())).toEqual({ granted: true, at: at(1) });
    const doc = settingsSync.getDocs().get('main');
    expect(doc).toMatchObject({ units: 'metric' });
    expect(doc).not.toHaveProperty('aiConsentHint');
    settingsSync.applyRemote({
      upserts: [{ docId: 'main', data: { ...defaultSettings, appearance: 'dark' } }],
      deletes: [],
    });
    expect(useSettingsStore.getState()).toMatchObject({
      settings: { appearance: 'dark' },
      aiConsentHint: { granted: true },
    });
  });
});
