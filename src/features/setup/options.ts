/**
 * Labels and helper copy for the onboarding answers. Identifiers come from the preferences
 * contract; this file only decides how they read on screen.
 */
import {
  TIME_BUDGET_CHOICES,
  type AllergenId,
  type DietId,
  type EffortLevel,
  type GoalId,
} from '@/features/auth';
import type { IconName } from '@/ui';

export interface Choice<T extends string | number> {
  id: T;
  label: string;
  description?: string;
  icon?: IconName;
}

export const dietChoices: readonly Choice<DietId>[] = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'pescatarian', label: 'Pescatarian' },
  { id: 'no_pork', label: 'No pork' },
  { id: 'no_beef', label: 'No beef' },
  { id: 'no_alcohol', label: 'No alcohol' },
  { id: 'halal_friendly', label: 'Halal-friendly' },
  { id: 'gluten_free', label: 'Gluten-free' },
  { id: 'dairy_free', label: 'Dairy-free' },
];

export const allergenChoices: readonly Choice<AllergenId>[] = [
  { id: 'milk', label: 'Milk' },
  { id: 'egg', label: 'Egg' },
  { id: 'fish', label: 'Fish' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'tree_nut', label: 'Tree nuts' },
  { id: 'peanut', label: 'Peanuts' },
  { id: 'wheat', label: 'Wheat' },
  { id: 'soy', label: 'Soy' },
  { id: 'sesame', label: 'Sesame' },
  { id: 'gluten', label: 'Gluten' },
];

export const goalChoices: readonly Choice<GoalId>[] = [
  { id: 'more_protein', label: 'More protein', icon: 'fish.fill' },
  { id: 'more_fiber', label: 'More fiber', icon: 'leaf.fill' },
  { id: 'lower_sodium', label: 'Less salt', icon: 'drop.fill' },
  { id: 'heart_friendly', label: 'Heart-friendly', icon: 'heart.fill' },
  { id: 'lighter_meals', label: 'Lighter meals', icon: 'scalemass' },
  { id: 'plant_forward', label: 'More plants', icon: 'carrot.fill' },
  { id: 'steady_energy', label: 'Steadier energy', icon: 'bolt.heart' },
];

function budgetLabel(minutes: number): string {
  return minutes === 60 ? 'An hour' : `${minutes} minutes`;
}

export const timeChoices: readonly { minutes: number | null; label: string }[] = [
  ...TIME_BUDGET_CHOICES.map((minutes) => ({ minutes, label: budgetLabel(minutes) })),
  { minutes: null, label: 'No limit' },
];

export const effortChoices: readonly Choice<EffortLevel>[] = [
  {
    id: 1,
    label: 'Keep it simple',
    description: 'Few steps and everyday techniques.',
    icon: 'hare.fill',
  },
  {
    id: 2,
    label: 'Happy to cook',
    description: 'A few more steps for a better result.',
    icon: 'frying.pan',
  },
  {
    id: 3,
    label: 'Bring it on',
    description: 'Projects and new techniques welcome.',
    icon: 'flame',
  },
];

const regionLabels: Record<string, string> = {
  north_america: 'North America',
  latin_america: 'Latin America',
  caribbean: 'Caribbean',
  northern_europe: 'Northern Europe',
  western_europe: 'Western Europe',
  southern_europe: 'Southern Europe',
  eastern_europe: 'Eastern Europe',
  middle_east: 'Middle East',
  north_africa: 'North Africa',
  sub_saharan_africa: 'Sub-Saharan Africa',
  south_asia: 'South Asia',
  central_asia: 'Central Asia',
  east_asia: 'East Asia',
  southeast_asia: 'Southeast Asia',
  oceania: 'Oceania',
  global: 'Everywhere',
};

/** Display order for regions; anything unlisted sorts after these. */
const regionOrder = Object.keys(regionLabels);

function titleCase(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function cuisineLabel(id: string): string {
  return titleCase(id);
}

export function regionLabel(id: string): string {
  return regionLabels[id] ?? titleCase(id);
}

export function compareRegions(a: string, b: string): number {
  const rank = (id: string) => {
    const index = regionOrder.indexOf(id);
    return index === -1 ? regionOrder.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

const categoryLabels: Record<string, string> = {
  spice: 'Spices & seasonings',
  oil: 'Oils',
  grain: 'Grains & baking',
  other: 'Other basics',
  produce: 'Fresh basics',
  dairy: 'Dairy',
  protein: 'Protein',
  sweetener: 'Sweeteners',
  beverage: 'Drinks',
  condiment: 'Sauces & condiments',
};

export function pantryCategoryLabel(category: string): string {
  return categoryLabels[category] ?? titleCase(category);
}

/** Ingredient names in the catalog are lower case; show them in sentence case. */
export function ingredientLabel(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

export interface CuisineSection {
  region: string;
  label: string;
  cuisines: { id: string; label: string }[];
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Cuisines grouped by region, filtered by a search that matches the cuisine or its region. Regions
 * keep a fixed geographic order; cuisines within one are alphabetical.
 */
export function groupCuisines(
  options: readonly { id: string; region: string }[],
  search: string,
): CuisineSection[] {
  const needle = fold(search);
  const byRegion = new Map<string, { id: string; label: string }[]>();
  for (const option of options) {
    const label = cuisineLabel(option.id);
    const matches =
      !needle || fold(label).includes(needle) || fold(regionLabel(option.region)).includes(needle);
    if (!matches) continue;
    const list = byRegion.get(option.region) ?? [];
    if (!list.some((existing) => existing.id === option.id)) list.push({ id: option.id, label });
    byRegion.set(option.region, list);
  }
  return [...byRegion.entries()]
    .sort(([a], [b]) => compareRegions(a, b))
    .map(([region, cuisines]) => ({
      region,
      label: regionLabel(region),
      cuisines: cuisines.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}
