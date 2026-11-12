/**
 * The pantry item editor's form: text fields in, a validated store patch out.
 */
import { parseQuantity } from '@/domain/units';
import type { IngredientCategory } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';

export interface PantryForm {
  readonly name: string;
  /** As typed: "2", "1.5", "1 1/2", "½", or blank for "I have some". */
  readonly qty: string;
  readonly unit: string;
  readonly category: IngredientCategory;
  readonly expiresAt: string | null;
}

export type PantryPatch = Partial<Omit<PantryItem, 'id' | 'addedAt'>>;

export type FormResult =
  | { readonly ok: true; readonly patch: PantryPatch }
  | { readonly ok: false; readonly field: 'name' | 'qty' | 'unit'; readonly message: string };

export const MAX_NAME_LENGTH = 80;
export const MAX_UNIT_LENGTH = 24;
const MAX_QTY = 1_000_000;

export function formFromItem(item: PantryItem): PantryForm {
  return {
    name: item.name,
    qty: item.qty == null ? '' : String(item.qty),
    unit: item.unit ?? '',
    category: item.category,
    expiresAt: item.expiresAt,
  };
}

export function parsePantryForm(form: PantryForm): FormResult {
  const name = form.name.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, field: 'name', message: 'Give it a name.' };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, field: 'name', message: `Keep the name under ${MAX_NAME_LENGTH} letters.` };
  }

  const qtyText = form.qty.trim();
  let qty: number | null = null;
  if (qtyText) {
    const parsed = parseQuantity(qtyText);
    // A range such as "2-3" is stored as its lower bound: what is certainly there.
    if (!parsed || !(parsed.value > 0) || parsed.value > MAX_QTY) {
      return { ok: false, field: 'qty', message: 'Enter an amount like 2, 1.5 or 1/2.' };
    }
    qty = Math.round(parsed.value * 1000) / 1000;
  }

  const unitText = form.unit.trim().replace(/\s+/g, ' ');
  if (unitText.length > MAX_UNIT_LENGTH) {
    return { ok: false, field: 'unit', message: 'That unit is too long.' };
  }
  if (unitText && qty == null) {
    return { ok: false, field: 'qty', message: 'Add an amount for that unit, or clear the unit.' };
  }

  return {
    ok: true,
    patch: {
      name,
      qty,
      unit: unitText || null,
      category: form.category,
      expiresAt: form.expiresAt,
    },
  };
}
