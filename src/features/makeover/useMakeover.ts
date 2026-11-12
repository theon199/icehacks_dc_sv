/**
 * Runs one makeover and re-checks the answer on the device. The allergen check uses the person's
 * declared allergens at the moment the answer arrives.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { MakeoverRequest, MakeoverResponse } from '@/lib/api/ai';
import { usePreferencesStore } from '@/stores';

import { aiApi, describeAiProblem, type AiProblem } from './deps';
import { findAllergenMentions, type AllergenHit } from './logic/allergenCheck';
import { checkedTexts } from './logic/request';

export type MakeoverState =
  | { readonly status: 'idle' }
  | { readonly status: 'working' }
  | {
      readonly status: 'done';
      readonly makeover: MakeoverResponse;
      /** Declared allergens the answer still mentions; saving is blocked while any remain. */
      readonly hits: readonly AllergenHit[];
    }
  | { readonly status: 'failed'; readonly problem: AiProblem };

const IDLE: MakeoverState = { status: 'idle' };
const COPY = { feature: 'Make it healthier', unit: 'makeovers' } as const;

export function useMakeover() {
  const [state, setState] = useState<MakeoverState>(IDLE);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const run = useCallback(async (request: MakeoverRequest) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: 'working' });
    try {
      const makeover = await aiApi.makeover(request, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const { prefs } = usePreferencesStore.getState();
      // Check against everything declared now and everything the request was made for.
      const allergens = [...new Set([...prefs.allergens, ...request.allergens])];
      const hits = findAllergenMentions(checkedTexts(makeover), allergens);
      setState({ status: 'done', makeover, hits });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: 'failed', problem: describeAiProblem(error, COPY) });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setState(IDLE);
  }, []);

  return { state, run, reset: cancel };
}
