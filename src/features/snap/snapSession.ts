/**
 * The latest snap result, handed from the camera to the result screens. It lives in memory only:
 * photos and AI readings are not kept once the app restarts, a new snap replaces the old one, and
 * the result is dropped as soon as the signed-in account changes (sign-out included).
 */
import { create } from 'zustand';

import type { SnapDish, SnapPantryItem } from '@/lib/api/ai';

import { onAccountChange } from './deps';

interface SnapResultBase {
  /** Changes with every snap, so result screens can reset their local edits. */
  id: string;
  /** Local file of the photo that was read, for the result header. */
  photoUri: string;
  takenAt: number;
  /** Snaps left today, when the server said. */
  remaining: number | null;
}

export interface PantrySnapResult extends SnapResultBase {
  mode: 'pantry';
  items: readonly SnapPantryItem[];
}

export interface DishSnapResult extends SnapResultBase {
  mode: 'dish';
  dish: SnapDish;
}

export type SnapResult = PantrySnapResult | DishSnapResult;

interface SnapSessionState {
  result: SnapResult | null;
  setResult: (result: SnapResult) => void;
  clear: () => void;
}

export const useSnapSession = create<SnapSessionState>()((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clear: () => set({ result: null }),
}));

// One account's photo and reading must never be visible to the next person who signs in.
onAccountChange(() => useSnapSession.getState().clear());

export const selectPantryResult = (state: SnapSessionState): PantrySnapResult | null =>
  state.result?.mode === 'pantry' ? state.result : null;

export const selectDishResult = (state: SnapSessionState): DishSnapResult | null =>
  state.result?.mode === 'dish' ? state.result : null;
