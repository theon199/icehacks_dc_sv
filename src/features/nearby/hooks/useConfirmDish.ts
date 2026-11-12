/**
 * "Did they have it?": records the answer once per place, dish and day, updates the tally
 * optimistically and rolls back if the server does not accept it.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { toast } from '@/ui';

import { ConfirmDishError, confirmDish } from '../api/confirmDish';
import { selectConfirmationLog, useConfirmationStore } from '../confirmationStore';
import { useViewerId } from '../deps';
import { getPlaceTally, setPlaceTally } from './useNearbyPlaces';
import {
  applyAnswer,
  confirmationKey,
  confirmationPrompt,
  type ConfirmationPrompt,
  type Tally,
} from '../model/confirmations';

interface Variables {
  placeId: string;
  hadIt: boolean;
  key: string;
}

interface Context {
  previous: Tally | null;
}

const currentTime = () => new Date();

export interface ConfirmDishControl {
  prompt: ConfirmationPrompt | null;
  answer: (hadIt: boolean) => void;
  pending: boolean;
}

/**
 * Confirmation state and action for one place. `prompt` is null when nobody is signed in.
 * `serverAnswer` is the person's last answer as the search reported it.
 */
export function useConfirmDish(
  dishKey: string,
  placeId: string,
  serverAnswer: boolean | null,
  now: () => Date = currentTime,
): ConfirmDishControl {
  const client = useQueryClient();
  const userId = useViewerId();
  const log = useConfirmationStore(selectConfirmationLog);
  const key = userId ? confirmationKey(userId, dishKey, placeId) : null;

  const mutation = useMutation<Tally, Error, Variables, Context>({
    mutationFn: (vars) => confirmDish({ placeId: vars.placeId, dishKey, hadIt: vars.hadIt }),
    onMutate: (vars) => {
      const previous = getPlaceTally(client, dishKey, vars.placeId);
      if (previous) setPlaceTally(client, dishKey, vars.placeId, applyAnswer(previous, vars.hadIt));
      return { previous };
    },
    onSuccess: (tally, vars) => setPlaceTally(client, dishKey, vars.placeId, tally),
    onError: (error, vars, context) => {
      useConfirmationStore.getState().forget(vars.key);
      if (context?.previous) setPlaceTally(client, dishKey, vars.placeId, context.previous);
      toast.show({
        tone: 'danger',
        message:
          error instanceof ConfirmDishError
            ? error.userMessage
            : "Your answer didn't save. Please try again.",
      });
    },
  });

  const { mutate, isPending } = mutation;
  const answer = useCallback(
    (hadIt: boolean) => {
      if (!key || isPending) return;
      // Recording first makes a double tap, or a second sheet for the same place, a no-op.
      if (!useConfirmationStore.getState().record(key, hadIt, now())) return;
      mutate({ placeId, hadIt, key });
    },
    [key, isPending, mutate, placeId, now],
  );

  return {
    prompt: key ? confirmationPrompt(log, key, serverAnswer, now()) : null,
    answer,
    pending: isPending,
  };
}
