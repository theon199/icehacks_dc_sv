/**
 * Cuisine and region ids. The catalog stores both on every recipe (docs/DATA.md); this table gives
 * the app display names and lets ranking relate a person's loved cuisines to their wider region.
 *
 * Cuisine ids are open-ended: a catalog may introduce one this build does not list, so lookups
 * fall back to a readable name and the recipe's own region.
 */
import { z } from 'zod';

export const REGIONS = [
  'north_america',
  'latin_america',
  'caribbean',
  'northern_europe',
  'western_europe',
  'southern_europe',
  'eastern_europe',
  'middle_east',
  'north_africa',
  'sub_saharan_africa',
  'south_asia',
  'central_asia',
  'east_asia',
  'southeast_asia',
  'oceania',
  'global',
] as const;

export type RegionId = (typeof REGIONS)[number];

export const regionIdSchema = z.enum(REGIONS);

export const REGION_LABELS: Readonly<Record<RegionId, string>> = {
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
  global: 'Around the world',
};

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && (REGIONS as readonly string[]).includes(value);
}

/** Lowercase snake_case slug, e.g. `indian`, `sri_lankan`. */
export type CuisineId = string;

export const cuisineIdSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z_]*$/, 'Cuisine ids are lowercase snake_case');

export interface CuisineInfo {
  readonly id: CuisineId;
  readonly label: string;
  readonly region: RegionId;
}

/** Cuisines offered in onboarding, grouped by region. Labels double as the adjective form. */
const BY_REGION: Readonly<Record<RegionId, readonly (readonly [CuisineId, string])[]>> = {
  north_america: [
    ['american', 'American'],
    ['canadian', 'Canadian'],
  ],
  latin_america: [
    ['mexican', 'Mexican'],
    ['guatemalan', 'Guatemalan'],
    ['salvadoran', 'Salvadoran'],
    ['colombian', 'Colombian'],
    ['venezuelan', 'Venezuelan'],
    ['peruvian', 'Peruvian'],
    ['chilean', 'Chilean'],
    ['argentinian', 'Argentinian'],
    ['uruguayan', 'Uruguayan'],
    ['brazilian', 'Brazilian'],
    ['latin_american', 'Latin American'],
  ],
  caribbean: [
    ['jamaican', 'Jamaican'],
    ['cuban', 'Cuban'],
    ['puerto_rican', 'Puerto Rican'],
    ['dominican', 'Dominican'],
    ['haitian', 'Haitian'],
    ['trinidadian', 'Trinidadian'],
    ['barbadian', 'Barbadian'],
    ['antiguan', 'Antiguan'],
    ['caymanian', 'Caymanian'],
    ['caribbean', 'Caribbean'],
  ],
  northern_europe: [
    ['british', 'British'],
    ['irish', 'Irish'],
    ['norwegian', 'Norwegian'],
    ['swedish', 'Swedish'],
    ['danish', 'Danish'],
    ['finnish', 'Finnish'],
  ],
  western_europe: [
    ['french', 'French'],
    ['german', 'German'],
    ['dutch', 'Dutch'],
    ['belgian', 'Belgian'],
    ['austrian', 'Austrian'],
    ['swiss', 'Swiss'],
  ],
  southern_europe: [
    ['italian', 'Italian'],
    ['spanish', 'Spanish'],
    ['portuguese', 'Portuguese'],
    ['greek', 'Greek'],
    ['croatian', 'Croatian'],
    ['cypriot', 'Cypriot'],
  ],
  eastern_europe: [
    ['polish', 'Polish'],
    ['russian', 'Russian'],
    ['ukrainian', 'Ukrainian'],
    ['hungarian', 'Hungarian'],
    ['romanian', 'Romanian'],
    ['czech', 'Czech'],
    ['slovak', 'Slovak'],
    ['georgian', 'Georgian'],
    ['bulgarian', 'Bulgarian'],
  ],
  middle_east: [
    ['turkish', 'Turkish'],
    ['lebanese', 'Lebanese'],
    ['syrian', 'Syrian'],
    ['palestinian', 'Palestinian'],
    ['israeli', 'Israeli'],
    ['iranian', 'Iranian'],
    ['iraqi', 'Iraqi'],
    ['saudi', 'Saudi'],
    ['yemeni', 'Yemeni'],
    ['armenian', 'Armenian'],
    ['middle_eastern', 'Middle Eastern'],
  ],
  north_africa: [
    ['moroccan', 'Moroccan'],
    ['egyptian', 'Egyptian'],
    ['tunisian', 'Tunisian'],
    ['algerian', 'Algerian'],
  ],
  sub_saharan_africa: [
    ['nigerian', 'Nigerian'],
    ['ghanaian', 'Ghanaian'],
    ['senegalese', 'Senegalese'],
    ['ethiopian', 'Ethiopian'],
    ['kenyan', 'Kenyan'],
    ['south_african', 'South African'],
    ['somali', 'Somali'],
    ['botswanan', 'Botswanan'],
    ['west_african', 'West African'],
  ],
  south_asia: [
    ['indian', 'Indian'],
    ['pakistani', 'Pakistani'],
    ['bangladeshi', 'Bangladeshi'],
    ['sri_lankan', 'Sri Lankan'],
    ['nepalese', 'Nepalese'],
    ['afghan', 'Afghan'],
  ],
  central_asia: [
    ['uzbek', 'Uzbek'],
    ['kazakh', 'Kazakh'],
  ],
  east_asia: [
    ['chinese', 'Chinese'],
    ['japanese', 'Japanese'],
    ['korean', 'Korean'],
    ['taiwanese', 'Taiwanese'],
    ['mongolian', 'Mongolian'],
  ],
  southeast_asia: [
    ['thai', 'Thai'],
    ['vietnamese', 'Vietnamese'],
    ['filipino', 'Filipino'],
    ['malaysian', 'Malaysian'],
    ['indonesian', 'Indonesian'],
    ['singaporean', 'Singaporean'],
    ['cambodian', 'Cambodian'],
    ['burmese', 'Burmese'],
    ['lao', 'Lao'],
  ],
  oceania: [
    ['australian', 'Australian'],
    ['new_zealand', 'New Zealand'],
    ['pacific_islands', 'Pacific Islands'],
  ],
  global: [['international', 'International']],
};

export const CUISINES: readonly CuisineInfo[] = REGIONS.flatMap((region) =>
  BY_REGION[region].map(([id, label]) => ({ id, label, region })),
);

const CUISINE_INDEX: ReadonlyMap<CuisineId, CuisineInfo> = new Map(
  CUISINES.map((info) => [info.id, info]),
);

export function cuisineInfo(id: CuisineId): CuisineInfo | undefined {
  return CUISINE_INDEX.get(id);
}

/** Display name; unknown ids become title case ("sri_lankan" → "Sri Lankan"). */
export function cuisineLabel(id: CuisineId): string {
  const known = CUISINE_INDEX.get(id);
  if (known) return known.label;
  return id
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Region of a known cuisine, or undefined when this build does not list it. */
export function cuisineRegion(id: CuisineId): RegionId | undefined {
  return CUISINE_INDEX.get(id)?.region;
}

export function cuisinesInRegion(region: RegionId): readonly CuisineInfo[] {
  return CUISINES.filter((info) => info.region === region);
}
