/**
 * Credits for the catalog, written from docs/data/SOURCES.md. Keep the two in step when a source
 * is added or removed.
 */
import type { AboutPage } from './types';

export const sourcesPage: AboutPage = {
  slug: 'sources',
  title: 'Data sources and credits',
  summary: 'Where recipes, photos and nutrition data come from.',
  blocks: [
    {
      kind: 'paragraph',
      text: 'Every recipe, nutrient value and link in Famara comes from a public source. When a value cannot be traced to one, Famara leaves it empty instead of making it up. Each recipe page names the source it came from.',
    },
    { kind: 'heading', text: 'Recipes and photos' },
    {
      kind: 'paragraph',
      text: 'Many recipes, photos and video links come from TheMealDB, a free, crowd-sourced recipe database. Thank you to TheMealDB and everyone who contributes to it.',
    },
    { kind: 'link', label: 'themealdb.com', url: 'https://www.themealdb.com' },
    { kind: 'heading', text: 'Healthy recipes' },
    {
      kind: 'paragraph',
      text: 'Courtesy of MedlinePlus from the National Library of Medicine. These recipes were first published by FoodHero.org (Oregon State University Extension Service) and the National Heart, Lung, and Blood Institute, and appear on MedlinePlus as public-domain content.',
    },
    { kind: 'link', label: 'MedlinePlus healthy recipes', url: 'https://medlineplus.gov/recipes/' },
    { kind: 'heading', text: 'Nutrition data' },
    {
      kind: 'paragraph',
      text: 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: Standard Reference (April 2018 release) and Foundation Foods (April 2026). Public domain (CC0 1.0).',
    },
    { kind: 'link', label: 'FoodData Central', url: 'https://fdc.nal.usda.gov' },
    { kind: 'heading', text: 'Daily targets' },
    {
      kind: 'paragraph',
      text: 'Daily nutrient targets follow the Dietary Guidelines for Americans and the Dietary Reference Intakes from the National Academies.',
    },
    { kind: 'heading', text: 'Video and web tutorials' },
    {
      kind: 'paragraph',
      text: "Tutorial links open the original publisher's page or video, for example on YouTube or the recipe author's own site. Famara does not host these videos; they belong to their creators.",
    },
    { kind: 'heading', text: "Famara's own work" },
    {
      kind: 'paragraph',
      text: 'The ingredient knowledge behind matching, allergens, diets, pantry staples and swaps was written and reviewed by the Famara team. Each ingredient is tied to the exact USDA food used for its nutrients.',
    },
    {
      kind: 'note',
      text: 'Nutrition values are estimates for information only and are not medical advice.',
    },
  ],
};
