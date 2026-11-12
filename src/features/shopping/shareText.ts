/**
 * The shopping list as plain text, for Messages, Notes or a partner doing the shop.
 */
import { shoppingListText, type AisleGroup, type CheckState } from '@/domain/shopping';
import type { UnitSystem } from '@/domain/units';
import type { ShoppingCheck } from '@/stores/shopping';

import { extraKey, type ExtraItem } from './extrasStore';

export const EXTRAS_TITLE = 'Added by you';

/** The check-off store's records in the shape the domain formatter reads. */
export function toCheckState(checked: Readonly<Record<string, ShoppingCheck>>): CheckState {
  return {
    checked: Object.fromEntries(
      Object.values(checked).map((check) => [check.key, check.checkedAt]),
    ),
  };
}

export interface ShareInput {
  readonly title: string;
  readonly groups: readonly AisleGroup[];
  readonly extras: readonly ExtraItem[];
  readonly checked: Readonly<Record<string, ShoppingCheck>>;
  readonly system: UnitSystem;
}

/**
 * What is still to buy, by aisle, then the hand-added extras. Ticked items are left out. Returns
 * null when nothing is left to buy.
 */
export function shoppingShareText(input: ShareInput): string | null {
  const body = shoppingListText(input.groups, {
    system: input.system,
    checks: toCheckState(input.checked),
  });
  const extras = input.extras
    .filter((extra) => !input.checked[extraKey(extra.id)])
    .map((extra) => `- ${extra.name}`);
  const blocks = [body, extras.length > 0 ? [EXTRAS_TITLE, ...extras].join('\n') : '']
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  if (blocks.length === 0) return null;
  return [input.title, ...blocks].join('\n\n');
}
