/**
 * Runs one import: shrink a photo on the device if there is one, send it to the import function,
 * and hand the recipe to Review through the import session. Cancellable, and cancelled when the
 * screen unmounts or the signed-in account changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { aiApi, type AiApi, type RecipeImportRequest } from '@/lib/api/ai';

import { preparePhoto, type PickedPhoto, type PreparedPhoto } from '../capture/photo';
import { onAccountChange } from '../deps';
import { useImportSession } from '../importSession';
import { sourceFor } from '../logic/draft';
import { describeImportProblem, type ImportProblem } from '../logic/importErrors';

export type ImportInput =
  | { source: 'link'; url: string }
  | { source: 'text'; text: string }
  | { source: 'photo'; photo: PickedPhoto };

export type ImportPhase =
  | { status: 'idle' }
  | { status: 'working'; source: ImportInput['source']; stage: 'preparing' | 'reading' }
  | { status: 'not_recipe'; reason: 'no_recipe' | 'unreadable' | 'blocked_source'; message: string }
  | { status: 'failed'; problem: ImportProblem; input: ImportInput };

export interface RecipeImportDeps {
  prepare: (photo: PickedPhoto) => Promise<PreparedPhoto>;
  importRecipe: AiApi['importRecipe'];
  now: () => number;
}

const defaultDeps: RecipeImportDeps = {
  prepare: preparePhoto,
  importRecipe: (input, options) => aiApi.importRecipe(input, options),
  now: () => Date.now(),
};

let sequence = 0;
const nextImportId = (now: number) => `${now.toString(36)}-${(sequence++).toString(36)}`;

export interface UseRecipeImportOptions {
  /** Called once the recipe is in the import session, ready for Review. */
  onResult: () => void;
  deps?: RecipeImportDeps;
}

export function useRecipeImport({ onResult, deps = defaultDeps }: UseRecipeImportOptions) {
  const [phase, setPhase] = useState<ImportPhase>({ status: 'idle' });
  // After the daily limit is hit, importing stays off until the server says it resets: any
  // import before then is certain to fail.
  const [pause, setPause] = useState<{ until: number; note: string } | null>(null);
  const pauseRef = useRef(pause);
  const controllerRef = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);
  const setPending = useImportSession((state) => state.setPending);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(
    () =>
      onAccountChange(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setPhase({ status: 'idle' });
        setPause(null);
      }),
    [],
  );
  useEffect(() => {
    pauseRef.current = pause;
    if (!pause) return undefined;
    const lift = setTimeout(() => setPause(null), Math.max(0, pause.until - deps.now()));
    return () => clearTimeout(lift);
  }, [pause, deps]);

  const start = useCallback(
    async (input: ImportInput) => {
      const paused = pauseRef.current;
      if (paused && paused.until > deps.now()) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;
      try {
        let request: RecipeImportRequest;
        if (input.source === 'photo') {
          setPhase({ status: 'working', source: 'photo', stage: 'preparing' });
          const photo = await deps.prepare(input.photo);
          if (signal.aborted) return;
          request = { source: 'photo', image: photo.base64 };
        } else {
          request = input;
        }
        setPhase({ status: 'working', source: input.source, stage: 'reading' });
        const response = await deps.importRecipe(request, { signal });
        if (signal.aborted) return;
        if (response.status === 'not_recipe') {
          setPhase({ status: 'not_recipe', reason: response.reason, message: response.message });
          return;
        }
        setPending({
          id: nextImportId(deps.now()),
          recipe: response.recipe,
          source: sourceFor(request, response.recipe),
          remaining: response.quota.remaining,
        });
        setPhase({ status: 'idle' });
        onResultRef.current();
      } catch (error) {
        if (signal.aborted) return;
        const problem = describeImportProblem(error, new Date(deps.now()));
        if (problem?.pause) {
          const next = {
            until: deps.now() + problem.pause.seconds * 1000,
            note: problem.pause.note,
          };
          pauseRef.current = next;
          setPause(next);
        }
        setPhase(problem ? { status: 'failed', problem, input } : { status: 'idle' });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [deps, setPending],
  );

  /** Stops the import in progress, or dismisses its result. */
  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPhase({ status: 'idle' });
  }, []);

  const retry = useCallback(() => {
    if (phase.status === 'failed') void start(phase.input);
  }, [phase, start]);

  return { phase, start, reset, retry, pausedNote: pause?.note ?? null };
}
