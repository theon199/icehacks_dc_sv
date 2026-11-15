/**
 * The Review screen's state: the editable draft of an imported recipe, its catalog matches, the
 * lines the person checked, the live safety check and pantry coverage, and saving.
 *
 * The safety check is null while names are being matched, and saving waits for it, so a recipe is
 * never saved with a result that does not match what is on screen.
 */
import { useCallback, useMemo, useState } from 'react';

import {
  checkOwnRecipe,
  confirmIngredient,
  nameKey,
  pantryCoverage,
  pruneConfirmations,
  unconfirmIngredient,
  type CatalogFacts,
  type IngredientConfirmation,
  type OwnIngredient,
} from '@/domain/ownRecipes';
import { newId } from '@/lib/id';
import {
  selectPantryItems,
  useMyRecipesStore,
  usePantryStore,
  type MyRecipeSaveResult,
} from '@/stores';

import { useCatalogMatches } from './useCatalogMatches';
import { useSafetyPrefs } from './useMyRecipeChecks';
import type { PendingImport } from '../importSession';
import {
  draftFromImport,
  draftProblem,
  filledIngredients,
  toMyRecipe,
  type RecipeDraft,
} from '../logic/draft';
import { safetySnapshot } from '../logic/safetyText';

export interface ReviewDeps {
  newId: () => string;
  now: () => string;
}

const defaultDeps: ReviewDeps = { newId, now: () => new Date().toISOString() };

export function useReviewRecipe(pending: PendingImport, deps: ReviewDeps = defaultDeps) {
  const [draft, setDraft] = useState<RecipeDraft>(() =>
    draftFromImport(pending.recipe, pending.source),
  );
  const [confirmations, setConfirmations] = useState<IngredientConfirmation[]>([]);
  const prefs = useSafetyPrefs();
  const pantry = usePantryStore(selectPantryItems);
  const saveRecipe = useMyRecipesStore((state) => state.save);

  const lines = useMemo(() => filledIngredients(draft), [draft]);
  const names = useMemo(() => lines.map((line) => line.name), [lines]);
  const { matches, isMatching, isError, retry } = useCatalogMatches(names);

  const catalogIdFor = useCallback(
    (name: string) => matches.get(nameKey(name))?.id ?? null,
    [matches],
  );
  const facts = useMemo(() => {
    const map = new Map<string, CatalogFacts>();
    for (const match of matches.values()) if (match) map.set(match.id, match);
    return map;
  }, [matches]);
  const ingredients = useMemo<OwnIngredient[]>(
    () =>
      lines.map((line) => ({
        text: line.text,
        name: line.name,
        catalogIngredientId: catalogIdFor(line.name),
      })),
    [lines, catalogIdFor],
  );
  const safety = useMemo(
    () =>
      isMatching ? null : checkOwnRecipe({ ingredients, catalog: facts, prefs, confirmations }),
    [isMatching, ingredients, facts, prefs, confirmations],
  );
  const coverage = useMemo(() => {
    const staples = new Set(
      [...facts.values()].filter((item) => item.pantryStaple).map((item) => item.id),
    );
    return pantryCoverage(ingredients, pantry, staples);
  }, [ingredients, pantry, facts]);

  const confirm = useCallback(
    (key: string) =>
      setConfirmations((current) => confirmIngredient(current, key, prefs, deps.now()) ?? current),
    [prefs, deps],
  );
  const undo = useCallback(
    (key: string) => setConfirmations((current) => unconfirmIngredient(current, key)),
    [],
  );

  const problem = draftProblem(draft);
  const canSave = safety !== null && problem === null;

  /** Saves the recipe; the id is set when it was saved. */
  const save = useCallback((): { result: MyRecipeSaveResult; id: string | null } => {
    if (!safety || draftProblem(draft) !== null) return { result: 'invalid', id: null };
    const id = deps.newId();
    const at = deps.now();
    const recipe = toMyRecipe(draft, {
      id,
      at,
      catalogIdFor,
      safety: safetySnapshot(safety, prefs, at),
      confirmations: pruneConfirmations(confirmations, lines),
    });
    const result = saveRecipe(recipe);
    return { result, id: result === 'saved' ? id : null };
  }, [safety, draft, deps, catalogIdFor, prefs, confirmations, lines, saveRecipe]);

  return {
    draft,
    setDraft,
    ingredients,
    safety,
    coverage,
    isMatching,
    matchError: isError,
    retryMatching: retry,
    confirm,
    undo,
    problem,
    canSave,
    save,
  };
}
