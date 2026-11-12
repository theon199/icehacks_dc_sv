# Famara catalog — data sources and credits

Every recipe, nutrient value and link in `assets/catalog/famara-catalog.db` comes from the public
sources below. Nothing in the catalog is invented: when a value cannot be traced to one of these
sources it is either derived by a documented rule (see [`METHODS.md`](METHODS.md)) or left empty and
listed in [`HELD.md`](HELD.md).

Each recipe row carries its own `source_name`, `source_url`, `license` and `image_credit`, so the
recipe screen can always show where a dish came from.

## Attribution text for the Sources screen

The app's **Data sources & credits** page can show the following text as-is.

> **Recipes and photos** — Many recipes, photos and video links come from **TheMealDB**
> (themealdb.com), a free, crowd-sourced recipe database. Thank you to TheMealDB and its
> contributors.
>
> **Healthy recipes** — Courtesy of **MedlinePlus from the National Library of Medicine**. These
> recipes were originally published by FoodHero.org (Oregon State University Extension Service)
> and the National Heart, Lung, and Blood Institute (NHLBI), and are presented on MedlinePlus as
> public-domain content.
>
> **Nutrition data** — U.S. Department of Agriculture, Agricultural Research Service.
> **FoodData Central** (fdc.nal.usda.gov): Standard Reference (April 2018 release) and Foundation Foods
> (April 2026). Public domain (CC0 1.0).
>
> **Video and web tutorials** — Links open the original publisher's page or video (for example
> YouTube or the recipe author's site). Famara does not host these videos; they belong to their
> creators.
>
> Nutrition values are estimates for information only and are not medical advice.

## Source details

| Source | What Famara uses | Access | Licence / terms | Credit |
| --- | --- | --- | --- | --- |
| TheMealDB API v1 (`https://www.themealdb.com/api/json/v1/1/`) | Every meal: name, category, area, instructions, ingredient + measure pairs, thumbnail URL, YouTube link, source link | `search.php?f=a…z`, cross-checked with `list.php` + `filter.php` by category and area, `lookup.php` for any id the letter search missed | Free API. The test key `1` is for development and education; TheMealDB asks apps released publicly on an app store to become a supporter (see Follow-ups in the PR) | "TheMealDB" on every recipe and photo |
| MedlinePlus Healthy Recipes (`https://medlineplus.gov/recipes/`) | Category index pages and every recipe page: title, prep/cook/total time, servings, ingredients (with sub-sections), directions, photo, Nutrition Facts panel | HTML pages, robots.txt respected (no disallowed paths are fetched) | Listed by MedlinePlus as public domain ("Healthy recipes" in *Linking to and Using Content from MedlinePlus*) | "Courtesy of MedlinePlus from the National Library of Medicine"; original publisher (FoodHero.org or NHLBI) kept in `source_name` |
| USDA FoodData Central — Standard Reference CSV (`FoodData_Central_sr_legacy_food_csv_2018-04.zip`) | `food`, `food_nutrient`, `nutrient`, `food_portion`, `measure_unit` for the ingredients Famara maps | Bulk download from `https://fdc.nal.usda.gov/download-datasets` | Public domain, CC0 1.0 | "USDA FoodData Central" |
| USDA FoodData Central — Foundation Foods CSV (`FoodData_Central_foundation_food_csv_2026-04-30.zip`) | Same tables, for foods only present in Foundation Foods | Bulk download, pinned release (see below) | Public domain, CC0 1.0 | "USDA FoodData Central" |
| YouTube oEmbed (`https://www.youtube.com/oembed`) | Title of each linked video and whether it still exists | One request per video during `npm run fetch` | Used only to label and validate links; no video content is stored | Video titles shown with the publisher "YouTube" |
| Recipe authors' web pages (from TheMealDB `strSource`) | Link only, checked with a HEAD request | One request per link during `npm run fetch` | Linked, never copied | Publisher shown as the site's host name |

### Releases and reproducibility

- FoodData Central releases are pinned in `tools/data/src/sources/fdc.ts`. The newest Foundation
  Foods bundle listed on the download page (October 2026) ships sample tables only (no `food`,
  `food_nutrient` or `food_portion` CSV), so the April 2026 bundle is used.
- `npm run fetch` caches every response under `tools/data/.cache/`; `npm run build` works offline
  from that cache. `meta.source_digest` in the database is a SHA-256 of all source records plus the
  knowledge tables, so two builds from the same inputs can be compared.
- Requests identify themselves as `FamaraDataBuilder/1.0`, are spaced at least 500 ms apart
  (≤ 2 per second) and retry with exponential backoff on network errors, 408, 425, 429 and 5xx.

## Knowledge tables written for Famara

The ingredient knowledge base in `tools/data/src/knowledge/` (canonical ingredients, synonyms,
aisles, allergen membership, diet attributes, pantry staples, substitutions with notes, cuisine
names) is Famara's own reviewed work. Each ingredient points at the USDA food used for its
nutrients by `fdc_id` and exact FDC description, and the build fails if the two ever disagree.
