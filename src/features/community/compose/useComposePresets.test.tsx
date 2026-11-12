import { renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useComposeDraftStore } from './draftStore';
import { useComposePresets, type ComposePresets } from './useComposePresets';
import type { RecipeSummary } from '../deps';
import { emptyDraft } from '../logic/compose';
import { makePost } from '../testing/fixtures';

const soup: RecipeSummary = {
  id: 'catalog:7',
  title: 'Red lentil soup',
  cuisine: 'Turkish',
  imageUrl: null,
  totalMinutes: 35,
};

const draft = () => useComposeDraftStore.getState().draft;

beforeEach(() => {
  useComposeDraftStore.setState({ ownerId: 'me', draft: emptyDraft });
});

describe('useComposePresets', () => {
  it('fills an empty draft with the recipe it was opened from', async () => {
    await renderHook(() => useComposePresets({ recipe: soup, remixOf: null, loading: false }));

    expect(draft()).toMatchObject({
      kind: 'cook',
      recipeId: 'catalog:7',
      recipeTitle: 'Red lentil soup',
      title: 'Red lentil soup',
    });
  });

  it('turns an empty draft into a remix of the chosen post', async () => {
    const original = makePost({ id: 'post-42', title: 'Grandma’s dal', recipe_ref: 'catalog:7' });

    await renderHook(() => useComposePresets({ recipe: soup, remixOf: original, loading: false }));

    expect(draft()).toMatchObject({
      kind: 'remix',
      parentPostId: 'post-42',
      parentTitle: 'Grandma’s dal',
      recipeId: 'catalog:7',
      title: 'Red lentil soup, my way',
    });
  });

  it('waits until the preset has loaded', async () => {
    const { rerender } = await renderHook((presets: ComposePresets) => useComposePresets(presets), {
      initialProps: { recipe: null, remixOf: null, loading: true },
    });
    expect(draft()).toEqual(emptyDraft);

    await rerender({ recipe: soup, remixOf: null, loading: false });
    expect(draft().recipeId).toBe('catalog:7');
  });

  it('asks before replacing an unfinished draft about something else', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const unfinished = { ...emptyDraft, recipeId: 'catalog:1', title: 'Half-written' };
    useComposeDraftStore.setState({ ownerId: 'me', draft: unfinished });

    await renderHook(() => useComposePresets({ recipe: soup, remixOf: null, loading: false }));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(draft()).toEqual(unfinished);
  });

  it('leaves a draft alone when it is already about the same recipe', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const inProgress = { ...emptyDraft, recipeId: 'catalog:7', title: 'My soup' };
    useComposeDraftStore.setState({ ownerId: 'me', draft: inProgress });

    await renderHook(() => useComposePresets({ recipe: soup, remixOf: null, loading: false }));

    expect(alert).not.toHaveBeenCalled();
    expect(draft()).toEqual(inProgress);
  });
});
