/**
 * The recipe just read by the import, handed from Add to Review. It lives in memory only and is
 * dropped as soon as the signed-in account changes (sign-out included), so one person's import is
 * never shown to the next.
 */
import { create } from 'zustand';

import type { ImportedRecipe } from '@/lib/api/ai';
import type { MyRecipeSource } from '@/stores';

import { onAccountChange } from './deps';

export interface PendingImport {
  /** Changes with every import, so Review can reset its local edits. */
  id: string;
  recipe: ImportedRecipe;
  source: MyRecipeSource;
  /** Imports left today, as the server said. */
  remaining: number;
}

interface ImportSessionState {
  pending: PendingImport | null;
  setPending: (pending: PendingImport) => void;
  clear: () => void;
}

export const useImportSession = create<ImportSessionState>()((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));

onAccountChange(() => useImportSession.getState().clear());
