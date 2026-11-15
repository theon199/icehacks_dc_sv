# Famara catalog — data sources and credits

The hosted catalog includes recipes from public collections and the previous Aptiva catalog.
The builder uses the documented rules in [METHODS.md](METHODS.md) to calculate nutrition and leaves
unavailable nutrient values empty.

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
> **Quick household recipes** come from USDA’s *Recipes for Healthy Kids Cookbook for Homes*
> and *America’s Harvest Cookbook*. Recipe details credit the USDA and link to the original recipe.
>
> **Aptiva recipes and illustrations** come from the pre-existing Aptiva catalog. Recipe details
> preserve publisher credit and identify Aptiva’s AI-generated illustrations where available.
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
| USDA household collections | Yield, ingredients, quantities, and cooking method for 25 dishes | [USDA Team Nutrition](https://www.fna.usda.gov/tn/recipes-healthy-kids-cookbook-homes) and [America’s Harvest](https://www.fna.usda.gov/americasharvest) | Famara writes its own directions from recipe facts and selects a specific option where needed | USDA publisher and recipe link |
| Aptiva shipped catalog | Recipe ingredients, directions and screened dish illustrations | GitHub snapshot and the public URLs in its media manifest | Aptiva-authored directions and documented reuse of publisher material | Recipe publisher and image credit where available |
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

## IceHacks catalog import

Famara added 25 USDA household recipes and imported 1,939 recipes from the
[Aptiva GitHub snapshot](https://github.com/theon199/Aptiva_AI/commit/03cd1c029e7341303e531f14c82750245884da1c).
The Firestore catalog totals 2,995 recipes, including the original 1,031 Famara recipes.
The USDA recipes use common grocery ingredients and take 30 minutes or less. Where a publisher
gives no total, Famara estimates the time from prep and the listed method. Recipes that call
for cooked rice or meat assume those ingredients are ready to use.

| Aptiva snapshot outcome | Recipes |
| --- | ---: |
| Shipped recipes evaluated | 3,504 |
| Imported | 1,939 |
| Duplicates | 761 |
| Excluded at source review | 128 |
| Excluded at Famara's ingredient and quality checks | 676 |

Aptiva-sourced recipes can use credited, screened AI illustrations from the pinned media
manifest. Illustrations load from Aptiva's public image bucket. The IceHacks build fetches recipe
text, attribution, and ingredient data from Cloud Firestore. The SQLite snapshot supplies the
import. Rows with missing or uncleared media use Famara's image fallback.

### Devpost disclosure draft

> For IceHacks, I built Famara’s recipe discovery, saving, and meal-planning demo and set up
> Firebase Authentication and a hosted Cloud Firestore catalog of 2,995 recipes. The catalog
> includes 1,939 recipe records from my earlier Aptiva app and 25 quick household recipes adapted
> from USDA collections. Recipe details credit Aptiva and the original publishers. I recalculated
> nutrition and dietary data using Famara’s rules. I used OpenAI Codex to help implement and test
> the app, catalog import, and Firebase integration, and to adapt the USDA cooking directions.
> Some imported Aptiva directions and credited dish illustrations were generated with AI.

[IceHacks rules](https://icehacks.devpost.com/rules) ·
[Devpost submission guidelines](https://icehacks.devpost.com/)
