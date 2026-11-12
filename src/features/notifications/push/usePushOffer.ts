/** State and actions behind the push opt-in card. */
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { toast } from '@/ui';

import { setPushEnabled, usePushEnabled } from '../deps';
import {
  readPushPermission,
  requestPushPermission,
  syncPushRegistration,
  type PermissionSnapshot,
} from './pushDevice';
import { recordDismissal, shouldOfferPush, type PushMoment } from './pushPolicy';
import { usePushState } from './pushState';

export interface PushOffer {
  visible: boolean;
  busy: boolean;
  accept: () => void;
  /** "Not now" (ask again in a couple of weeks) or, with `forever`, "Don't ask again". */
  dismiss: (forever?: boolean) => void;
}

export function usePushOffer(moment: PushMoment): PushOffer {
  const userId = useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
  const pushEnabled = usePushEnabled();
  const history = usePushState((s) => s.prompt);
  const setPrompt = usePushState((s) => s.setPrompt);
  // When the permission was read doubles as "now" for the re-ask cool-down.
  const [permission, setPermission] = useState<(PermissionSnapshot & { at: number }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let active = true;
    readPushPermission()
      .then((snapshot) => {
        if (active) setPermission({ ...snapshot, at: Date.now() });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const visible =
    !hidden &&
    userId != null &&
    permission != null &&
    shouldOfferPush({
      permission: permission.permission,
      canAskAgain: permission.canAskAgain,
      pushEnabled,
      history,
      moment,
      now: permission.at,
    });

  const dismiss = useCallback(
    (forever = false) => {
      setPrompt(recordDismissal(usePushState.getState().prompt, Date.now(), forever));
      setHidden(true);
    },
    [setPrompt],
  );

  const accept = useCallback(() => {
    if (!userId || busy) return;
    setBusy(true);
    setPushEnabled(true);
    requestPushPermission()
      .then(async (result) => {
        setPermission({ ...result, at: Date.now() });
        if (result.permission === 'granted') {
          setHidden(true);
          await syncPushRegistration(userId, { force: true });
          toast.success("You're all set. We'll let you know when something happens.");
          return;
        }
        dismiss();
        if (!result.canAskAgain) {
          toast.show({
            message: 'Notifications are off for Famara. You can turn them on in Settings.',
            action: { label: 'Settings', onPress: () => void Linking.openSettings() },
          });
        }
      })
      .catch((error: unknown) => {
        logger.warn('Push opt-in failed', describeError(error));
        toast.error("Couldn't turn on notifications. Please try again.");
      })
      .finally(() => setBusy(false));
  }, [busy, dismiss, userId]);

  return { visible, busy, accept, dismiss };
}
