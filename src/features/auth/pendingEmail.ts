/**
 * The address waiting for its confirmation link. Kept in memory (not in the route URL) so the
 * check-email screen can offer to resend without the address travelling through navigation state.
 */
import { create } from 'zustand';

interface PendingEmailState {
  email: string | null;
  /** When the confirmation email went out, so the resend countdown survives a re-render. */
  sentAt: number | null;
  setPending: (email: string, sentAt?: number | null) => void;
  clear: () => void;
}

export const usePendingEmail = create<PendingEmailState>()((set) => ({
  email: null,
  sentAt: null,
  setPending: (email, sentAt = Date.now()) => set({ email, sentAt }),
  clear: () => set({ email: null, sentAt: null }),
}));
