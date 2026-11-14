/** The row of dots under the deck: one per card lined up, capped, with the rest as "+N". */

/** Dots drawn at most; anything past this is stated as a count rather than dropped. */
export const MAX_DECK_DOTS = 8;

export interface DeckDotsModel {
  /** Cards lined up, the top one included. */
  readonly remaining: number;
  readonly dots: number;
  /** Cards past the cap, shown as "+N"; 0 draws no count. */
  readonly overflow: number;
  readonly accessibilityLabel: string;
}

export function deckDots(remaining: number): DeckDotsModel {
  const count = Math.max(0, Math.floor(remaining));
  const dots = Math.min(count, MAX_DECK_DOTS);
  return {
    remaining: count,
    dots,
    overflow: count - dots,
    accessibilityLabel: `${count} ${count === 1 ? 'recipe' : 'recipes'} lined up`,
  };
}
