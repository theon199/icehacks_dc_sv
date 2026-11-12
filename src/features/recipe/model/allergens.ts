/**
 * Allergen and diet labels for a recipe, written so incomplete data is never presented as safe.
 *
 * - An allergen is only called absent when the catalog verified it `free`. Anything else is either
 *   `contains` or `unknown`, and unknown is said out loud ("Not verified"), never left blank.
 * - A diet badge is only shown when the catalog says the recipe fits it and, for diets an
 *   allergen can disprove (vegan, dairy-free, gluten-free), the relevant allergens are verified free.
 *   Otherwise the diet is listed as unverified.
 * - The person's own allergens come first, with a clear warning tone.
 */
import {
  ALLERGEN_IDS,
  ALLERGEN_LABELS,
  DIET_ALLERGEN_CHECKS,
  DIET_LABELS,
  dietNames,
  withImpliedDiets,
  type AllergenId,
  type AllergenMap,
  type AllergenStatus,
  type DietFlagName,
} from '@/domain';

export type AllergenTone = 'danger' | 'warning' | 'safe' | 'neutral';

export interface AllergenBadge {
  readonly allergen: AllergenId;
  readonly status: AllergenStatus;
  /** One of the person's declared allergens. */
  readonly declared: boolean;
  readonly label: string;
  readonly tone: AllergenTone;
}

export interface AllergenSummary {
  /** The person's declared allergens with this recipe's status, in vocabulary order. */
  readonly yours: readonly AllergenBadge[];
  /** Other allergens the recipe contains. */
  readonly contains: readonly AllergenBadge[];
  /** Other allergens whose status could not be verified. */
  readonly unverified: readonly AllergenBadge[];
  /** True when any declared allergen is not verified free: the recipe is not safe to assume. */
  readonly conflict: boolean;
  /** Short headline for the panel. */
  readonly headline: string;
}

function badge(allergen: AllergenId, status: AllergenStatus, declared: boolean): AllergenBadge {
  const name = ALLERGEN_LABELS[allergen];
  if (status === 'contains') {
    return {
      allergen,
      status,
      declared,
      label: `Contains ${name.toLowerCase()}`,
      tone: declared ? 'danger' : 'neutral',
    };
  }
  if (status === 'unknown') {
    return {
      allergen,
      status,
      declared,
      label: `${name}: not verified`,
      tone: 'warning',
    };
  }
  return { allergen, status, declared, label: `No ${name.toLowerCase()}`, tone: 'safe' };
}

/**
 * `declared` is null when the person has not answered the allergen question yet; then every
 * allergen that is not verified free is listed, because none of them can be ruled out.
 */
export function summariseAllergens(
  map: Partial<AllergenMap> | null | undefined,
  declared: readonly AllergenId[] | null,
): AllergenSummary {
  const mine = new Set(declared ?? []);
  const yours: AllergenBadge[] = [];
  const contains: AllergenBadge[] = [];
  const unverified: AllergenBadge[] = [];
  for (const allergen of ALLERGEN_IDS) {
    // A missing entry is unknown, never free.
    const status: AllergenStatus = map?.[allergen] ?? 'unknown';
    if (mine.has(allergen)) yours.push(badge(allergen, status, true));
    else if (status === 'contains') contains.push(badge(allergen, status, false));
    else if (status === 'unknown') unverified.push(badge(allergen, status, false));
  }
  const conflict = yours.some((b) => b.status !== 'free');
  return { yours, contains, unverified, conflict, headline: headline(yours, declared) };
}

function headline(yours: readonly AllergenBadge[], declared: readonly AllergenId[] | null): string {
  if (declared === null) return 'Add your allergies in Preferences to check this recipe';
  if (yours.some((b) => b.status === 'contains')) return 'Contains something you avoid';
  if (yours.some((b) => b.status === 'unknown')) {
    return "We couldn't verify this recipe against your allergies";
  }
  if (yours.length > 0) return 'Free from your allergens, based on its ingredients';
  return 'You told us you have no food allergies';
}

export type DietBadgeStatus = 'fits' | 'unverified';

export interface DietBadge {
  readonly diet: DietFlagName;
  readonly status: DietBadgeStatus;
  readonly label: string;
}

/** Diets this recipe fits by its catalog flags, with allergen-checkable diets cross-checked. */
export function dietBadges(
  dietFlags: number,
  allergens: Partial<AllergenMap> | null | undefined,
): DietBadge[] {
  const out: DietBadge[] = [];
  for (const diet of dietNames(withImpliedDiets(dietFlags))) {
    const checks = DIET_ALLERGEN_CHECKS[diet] ?? [];
    const statuses = checks.map((allergen) => allergens?.[allergen] ?? 'unknown');
    // A `contains` disproves the flag outright: say nothing rather than something wrong.
    if (statuses.includes('contains')) continue;
    const verified = statuses.every((status) => status === 'free');
    out.push({
      diet,
      status: verified ? 'fits' : 'unverified',
      label: verified ? DIET_LABELS[diet] : `${DIET_LABELS[diet]}: not verified`,
    });
  }
  return out;
}

/**
 * Short notes for ingredient lines that contain one of the person's declared allergens, keyed by
 * catalog ingredient id: "Contains peanuts", "Contains milk and egg". Lines for other ingredients
 * get no note; the allergen panel covers unverified data for the recipe as a whole.
 */
export function lineAllergenNotes(
  ingredients: ReadonlyMap<string, { readonly allergens: readonly AllergenId[] }>,
  declared: readonly AllergenId[] | null,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  if (!declared || declared.length === 0) return out;
  for (const [id, ingredient] of ingredients) {
    const hits = ALLERGEN_IDS.filter(
      (allergen) => declared.includes(allergen) && ingredient.allergens.includes(allergen),
    );
    if (hits.length === 0) continue;
    const names = hits.map((allergen) => ALLERGEN_LABELS[allergen].toLowerCase());
    const list =
      names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
    out.set(id, `Contains ${list}`);
  }
  return out;
}
