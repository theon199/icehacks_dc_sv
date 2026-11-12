/**
 * Wording for a makeover the server held back because its answer still contained one of the
 * person's declared allergens. Naming them tells the person what to steer the next try away from.
 */
import { ALLERGEN_LABELS, type AllergenId } from '@/domain/types/allergens';

export interface ConflictNotice {
  readonly title: string;
  readonly message: string;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function conflictNotice(allergens: readonly AllergenId[]): ConflictNotice {
  const names = [...new Set(allergens)].map((id) => ALLERGEN_LABELS[id].toLowerCase());
  const message =
    'Famara held this version back to keep you safe. Try again, or pick different goals.';
  if (names.length === 0) {
    return { title: 'That version still had one of your allergens', message };
  }
  return { title: `That version still had ${joinNames(names)}`, message };
}
