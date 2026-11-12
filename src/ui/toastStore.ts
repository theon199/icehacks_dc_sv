/**
 * App-wide toast queue. Call `toast.show(...)` from anywhere (no hook needed); `ToastHost`, mounted
 * once at the root, renders the front of the queue.
 */
import { create } from 'zustand';

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. Toasts with an action stay a little longer by default. */
  durationMs?: number;
}

export interface Toast extends Required<Pick<ToastInput, 'message' | 'tone' | 'durationMs'>> {
  id: number;
  action?: ToastAction;
}

interface ToastState {
  queue: Toast[];
  show: (input: ToastInput) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

const MAX_QUEUE = 3;
let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  queue: [],
  show: (input) => {
    const id = nextId++;
    const toast: Toast = {
      id,
      message: input.message,
      tone: input.tone ?? 'neutral',
      durationMs: input.durationMs ?? (input.action ? 5000 : 3200),
      ...(input.action ? { action: input.action } : {}),
    };
    set((state) => {
      // Drop an identical message already waiting so repeated failures do not stack up.
      const queue = state.queue.filter((t) => t.message !== toast.message);
      return { queue: [...queue, toast].slice(-MAX_QUEUE) };
    });
    return id;
  },
  dismiss: (id) => set((state) => ({ queue: state.queue.filter((t) => t.id !== id) })),
  clear: () => set({ queue: [] }),
}));

export const toast = {
  show: (input: ToastInput) => useToastStore.getState().show(input),
  success: (message: string) => useToastStore.getState().show({ message, tone: 'success' }),
  error: (message: string) => useToastStore.getState().show({ message, tone: 'danger' }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
