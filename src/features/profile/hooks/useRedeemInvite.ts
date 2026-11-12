/**
 * Accepting a friend invite opened from a link. The flow is a small state machine:
 *
 *   malformed  the link does not contain a valid code (nothing is sent)
 *   ready      waiting for the person to accept
 *   redeeming  request in flight
 *   accepted   connected; carries the inviter
 *   failed     carries why, so the screen can explain expired / used / own invites
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { isApiError } from '@/lib/api/errors';
import type { RedeemedInvite } from '@/lib/supabase/database.types';

import { profileKeys } from './queryKeys';
import { useMyUserId } from './useProfileData';
import { redeemFriendInvite } from '../api/friendsApi';
import { classifyRedeemError, normalizeInviteCode, type RedeemFailure } from '../model/invites';

export type RedeemState =
  | { status: 'malformed' }
  | { status: 'ready'; code: string }
  | { status: 'redeeming'; code: string }
  | { status: 'accepted'; code: string; inviter: RedeemedInvite }
  | { status: 'failed'; code: string; failure: RedeemFailure; serverMessage?: string };

export function useRedeemInvite(rawCode: string) {
  const code = normalizeInviteCode(rawCode);
  const me = useMyUserId();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (validCode: string) => redeemFriendInvite(validCode),
    onSuccess: async () => {
      if (!me) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.follows(me) }),
        queryClient.invalidateQueries({ queryKey: profileKeys.suggestions(me) }),
      ]);
    },
  });

  // The same screen can be reused for a different link. An outcome only counts for the code it
  // was requested for; anything older is cleared so it cannot leak into the new invite.
  const attempted = mutation.variables;
  const forThisCode = code != null && attempted === code;
  const { reset } = mutation;
  useEffect(() => {
    if (attempted !== undefined && attempted !== code) reset();
  }, [attempted, code, reset]);

  let state: RedeemState;
  if (!code) state = { status: 'malformed' };
  else if (!forThisCode || mutation.isIdle) state = { status: 'ready', code };
  else if (mutation.isPending) state = { status: 'redeeming', code };
  else if (mutation.isSuccess) state = { status: 'accepted', code, inviter: mutation.data };
  else {
    const error = mutation.error;
    state = {
      status: 'failed',
      code,
      failure: classifyRedeemError(error),
      ...(isApiError(error) && error.serverMessage ? { serverMessage: error.serverMessage } : {}),
    };
  }

  const accept = () => {
    if (code && state.status !== 'redeeming') mutation.mutate(code);
  };
  return { state, accept };
}
