/**
 * Background work that belongs to a signed-in session as a whole rather than to any one screen.
 * Renders nothing visible; mount it once inside the signed-in layout. While the session is ready
 * it:
 *
 * - runs the notification plumbing (banners, tap routing, push registration, realtime inbox
 *   refresh and the app icon badge);
 * - retries cooks the server has not heard about yet, without waiting for a cook screen to open;
 * - opens an invite link that arrived before the person had signed in or finished setup.
 *
 * The work lives in a child keyed by account, so nothing runs outside a ready session and a
 * different account on the same device starts from a clean slate.
 */
import { useSessionStore } from '@/features/auth';
import { useFlushPendingCooks } from '@/features/cook';
import { NotificationBridge } from '@/features/notifications';

import { usePendingInviteResume } from './usePendingInviteResume';

function ReadySessionEffects() {
  useFlushPendingCooks();
  usePendingInviteResume();
  return <NotificationBridge />;
}

export function SignedInEffects() {
  const userId = useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
  return userId ? <ReadySessionEffects key={userId} /> : null;
}
