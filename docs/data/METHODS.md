# Famara catalog — how derived fields are computed

Every field in the catalog that a source does not publish directly is computed by a deterministic
rule in `tools/data/src`. Same inputs, same output — no model, no randomness. This page is the
reference for those rules; the code comments repeat the key numbers next to the implementation.

## 1. Ingredient lines

**Measures** (`parse/measure.ts`). A leading amount is read as a number (`2`, `1.5`, `1 1/2`,
`1 and 1/2`, unicode fractions such as `½`, word numbers such as `two` or `half`), an optional range
(`2-3`, `2 to 4` → the midpoint), an optional size word (`small`, `medium`, `large`) and an
optional unit. Units are normalised (`tbs`, `Tblsp`, capital `T` → `tbsp`; `t` → `tsp`; `tin` →
`can`; `cl`/`dl` → `ml`). Package sizes are understood (`1 x 400g tin`, `2 (14.5 ounce) cans`), as is
a trailing alternative measure (`175g/6oz` keeps the first). Phrases such as *to taste*, *for
frying*, *garnish*, *as needed* mark a line as unquantified.

**Matching** (`match/`). Text is lower-cased, accent-folded, stripped of punctuation and simply
singularised. The matcher finds the longest known phrase (up to 7 words) from the ingredient
synonym index, so *low-sodium soy sauce* beats *soy sauce*, and *ground beef* beats *beef*. The
primary ingredient is taken from the part before the first comma; preparation notes are only
searched when that part names nothing. Every ingredient the whole line mentions — alternatives
(*butter or margarine*) and asides (*cooked protein (ham, chicken or tofu)*) — feeds the safety
roll-ups below. A line with no match keeps `ingredient_id = NULL`.

**Weights** (`derive/ingredients.ts`). Grams come from, in order: a mass unit in the text; the
ingredient's own table weights (`units`); USDA household portions for the matched FDC food
(*cup, chopped*, *tbsp*, *large*, *clove*, a portion named after the food itself, …); a cup weight
derived from a tablespoon/teaspoon portion; a category cup weight (e.g. produce 150 g, liquids
240 g). Spoons are derived from the cup by volume. Small and large items are 0.75× and 1.3× a medium
one. Container and approximate units fall back to generic weights (can 400 g, bunch 60 g, handful
30 g, knob 15 g, slice 30 g …). The resolved table is stored per ingredient in `grams_per_unit`.

## 2. Nutrition

Per-100 g nutrients come from the ingredient's FDC food: energy (1008, else 2048/2047, else
Atwater 4/4/9), protein (1003), fat (1004/1085), carbohydrate (1005/1050), fibre (1079), total
sugars (2000/1063), saturated fat (1258) and sodium (1093). Missing values count as zero.

A recipe total is the sum over lines with a known weight. When a line says *salt to taste*, 1.5 g of
salt is added once per recipe. Plain water and ice add weight to nothing.

**Coverage** is the share of quantified lines whose weight and nutrients are both known
(ingredients without FDC data count as known only below 5 g). Nutrition is reported only at
≥ 80 % coverage and when energy per serving lands in the sanity range: 30–2,500 kcal for computed
estimates, 5–2,500 kcal for values printed on a MedlinePlus Nutrition Facts panel (dips, salsas and
pickles legitimately have tiny servings). Otherwise the recipe ships with `nutrition_confidence =
'none'` and empty nutrient columns.

| Source | Values | `nutrition_confidence` |
| --- | --- | --- |
| MedlinePlus | The published Nutrition Facts panel, per published serving | `computed` |
| TheMealDB | USDA-based totals ÷ estimated servings | `estimated` |

**Added sugars.** USDA FPED reports added sugars per survey food code, which does not map onto the
Standard Reference and Foundation foods Famara uses, so it is not used. Instead, added sugar is the total sugar
of ingredients that are themselves sweeteners or sweetened products (sugar, syrups, honey, jams,
sweetened condensed milk, ketchup, sweet sauces, chocolate, sweetened dried fruit …; flagged
`addedSugar` in the knowledge tables). MedlinePlus values come from the label when it prints
"Includes … Added Sugars", otherwise from this estimate.

## 3. Servings, time and effort

**Servings** (TheMealDB publishes none). Food weight (water excluded) ÷ a typical portion for the
course — main 400 g, soup 450 g, salad 250 g, side 225 g, breakfast 300 g, snack 120 g, dessert
150 g, drink 300 g — rounded and clamped to 1–12. The estimate is then nudged so energy per serving
stays within the course's range (e.g. main 250–900 kcal, dessert 120–650 kcal) and protein stays
at or below 55 g. With an unknown weight the estimate is 4. Recipes with estimated servings always
carry `nutrition_confidence = 'estimated'`.

**Time.** MedlinePlus publishes prep, cook and total time; `total_minutes` is the total (or
prep + cook) and `active_minutes` the prep time. For TheMealDB: preparation = 5 min + 1.5 min per
ingredient line (max 40); cooking = the sum of step timers, or a per-course default when no step
names a duration (main/soup/dessert 30, side 20, breakfast 15, snack 10, salad/drink 0); total =
preparation + cooking; active = preparation + 15 % of cooking (at most +30 min, since proving,
chilling or marinating is hands-off). Both are rounded to 5 minutes.

**Timers** (`parse/steps.ts`). A step's `timer_seconds` is the longest duration it names
(`simmer 20 minutes`, `bake 1 hour 15 minutes`, `soak for twenty-four hours`, `a few minutes` = 3).
Ranges use the lower bound so the cook checks early. Durations after *within*, *every*, *up to*,
*than*, *first*, *last* or *over* are advice, not timers. Timers are 5 seconds to 24 hours.

**Steps.** Instructions are split on line breaks; `STEP n` labels, numbering and bullets are
removed; sub-headings ending in a colon are merged into the next step; paragraphs over 420
characters are regrouped by sentence. A recipe written as a single paragraph of three or more
sentences is regrouped into steps of at most two sentences (≤ 200 characters) for cook mode.

**Effort** (1 easy … 3 involved). Points: ingredient lines > 8 → 1, > 12 → 2; steps > 5 → 1, > 8 → 2;
active minutes > 25 → 1, > 45 → 2; +1 for an involved technique (deep-frying, kneading, proving,
laminating, tempering, sugar thermometer, blind baking, rolling out, piping, caramel, choux,
overnight marinating). 0–1 points → 1, 2–3 → 2, 4+ → 3.

## 4. Classification

**Course.** Drinks are detected by title first (smoothie, shake, juice, lemonade, cooler …, unless
the title is clearly food such as *fudge* or *glazed*). MedlinePlus index pages map in priority
order drinks → soups → salads → desserts → breakfast → dinner/lunch (main) → side dishes/breads
(side) → snacks/dips (snack). TheMealDB: *Dessert* → dessert; then title words for soup and salad;
*Breakfast* → breakfast, *Side* → side, *Starter* → snack, sauces in *Miscellaneous* → side;
everything else → main.

**Cuisine and region.** In order: TheMealDB's area (country or demonym, e.g. *United States*,
*Norway*, *Saudi Arabian*); a country or demonym in the title (*Cambodian Fish Curry*); dish words
(enchilada → Mexican, risotto → Italian, pad thai → Thai, …); otherwise *American* for MedlinePlus
and *International* for TheMealDB. Ingredient names that contain a country word (*Swiss chard*,
*French fries*, *Turkish delight*, *turkey*) are ignored. Each cuisine belongs to one of 16 regions
(`knowledge/cuisines.ts`).

**Families.** `family_id` is `fam:` + the sorted set of title words after removing variant words
(easy, healthy, classic, baked, grilled, slow cooker, recipe …), so *Easy Meatballs* and *Baked
Meatballs* share a family.

**Slugs** are ASCII, lower-case, hyphenated titles; repeats get `-2`, `-3` … in id order.

## 5. Safety: allergens and diets (fail-closed)

Allergens follow the U.S. major nine plus gluten. Ingredient rules are deliberately conservative:
wheat always implies gluten; soy sauce = soy + wheat + gluten; pesto = tree nut + milk;
Worcestershire = fish + gluten; oyster sauce = shellfish + soy + wheat + gluten; molluscs count as
shellfish; oats count as gluten (cross-contact); coconut counts as a tree nut. Store-bought
products whose recipe varies by brand (bread, sausages, stock cubes, curry pastes, pastry, pasta
sauce, chocolate …) are `allergen_status = 'unknown'`: their listed allergens are certain, every
other allergen is unknown.

A recipe allergen is `contains` if any matched ingredient contains it, otherwise `unknown` if any
line is unmatched or any ingredient is `unknown`, otherwise `free`.

Diet flags are the intersection of every named ingredient's flags; an unmatched line clears all of
them. Vegan is never claimed for variable products; *no pork* / *no beef* / *halal-friendly* are
never claimed with gelatin or unspecified meat; gluten-free and dairy-free also require the
recipe's gluten / milk status to be `free`. Halal-friendly means no pork, no alcohol and no gelatin
or unspecified meat — informational only, not a certification.

**Title cross-check.** Some source lists omit the main ingredient (*… Pork Belly* with no pork
line). Proteins, dairy, nuts and seeds named in the title whose diet or allergen effect is missing
from the list are added to the roll-ups, unless the title says it is vegan, vegetarian or "…-free".

## 6. Goals, gentle and health score

**Goal tags** (per serving; require reported nutrition except `plant_forward`):

| Tag | Rule | Basis |
| --- | --- | --- |
| `high_protein` | ≥ 20 g, or ≥ 10 g with ≥ 25 % of energy from protein | 20 g = 40 % of the 50 g Daily Value |
| `high_fiber` | ≥ 5.6 g | FDA "high": ≥ 20 % of the 28 g Daily Value |
| `lower_sodium` | ≤ 600 mg for mains and soups, ≤ 480 mg otherwise | FDA "healthy" sodium limits (meals / individual foods) |
| `lower_sat_fat` | < 10 % of energy from saturated fat | Dietary Guidelines for Americans limit |
| `lower_calorie` | ≤ 120 kcal per 100 g and ≤ 600 kcal, or ≤ 150 kcal for sides, salads, snacks, desserts and drinks | FDA "low calorie" meal density |
| `plant_forward` | Vegan, or vegetarian with ≥ 50 % of food weight from produce, legumes, grains, nuts and seeds | — |
| `heart_friendly` | `lower_sat_fat`, ≤ 600 mg sodium, ≥ 2.8 g fibre, < 10 % of energy from added sugars | FDA "good source" of fibre; DGA added-sugar limit |

**Gentle** (small-appetite friendly): 150–550 kcal per serving, ≤ 800 mg sodium, ready within 60
minutes at effort 1–2, soft cooking (a soup or breakfast, or a step that simmers, steams, poaches,
bakes, braises, mashes or blends), no deep-frying or charring, not billed as very spicy, not a drink.

**Health score** (`tools/data/src/score.ts`, 0–1): rewards — fibre per 100 kcal (full at 1.4 g),
protein per 100 kcal (full at 5 g), produce + legume share of food weight (full at 50 %); penalties
— sodium per 100 kcal (from 50 mg, full at 250 mg), saturated-fat share of energy (from 7 %, full at
20 %), added-sugar share of energy (from 5 %, full at 25 %). Score = clamp(0.5 + 0.5 × mean(rewards)
− 0.5 × mean(penalties)), three decimals. Without nutrition: 0.3 + 0.4 × plant reward.

## 7. Summary

One or two sentences built only from catalog fields: cuisine, course, up to three key ingredients
(those the title names first, then the heaviest, skipping aromatics, fats, flours and eggs unless
the title names them), total time, and one standout fact chosen in order: protein (if
`high_protein`), fibre (`high_fiber`), energy (`lower_calorie`, ≤ 350 kcal), sodium
(`lower_sodium`), plant-forward, otherwise energy. No health claims.

## 8. Tutorials

TheMealDB `strYoutube` becomes a `video` (canonical `https://www.youtube.com/watch?v=<11-char id>`)
and `strSource` a `web` link; MedlinePlus recipes link to their own page. URLs must be valid
http(s). During `npm run fetch`, videos are checked with YouTube oEmbed (missing → dropped; the
title is kept when available) and web links with a HEAD request (404/410 or a host that no longer
resolves → dropped; bot blocks and server errors keep the link).

## 9. Quality gates

`npm run build` fails unless all of these hold: knowledge tables validate; every FDC id exists and
its description matches; no synonym maps to two ingredients; substitutions reference known
ingredients, are unique and have notes; unique recipe ids and slugs; every recipe has ≥ 1
ingredient and ≥ 1 step; enums are valid (course, cuisine, region, confidence, goal tags, allergen
states, diet bits, effort 1–3); servings 1–48; active ≤ total minutes; health score 0–1; nutrient
values non-negative, saturated fat ≤ fat, sodium ≤ 8,000 mg, protein energy ≤ total energy, energy
within the ranges above; no `free` allergen or diet flag on a recipe with an unmatched line; every
`ingredient_id` exists; ≥ 98 % of ingredient lines matched; SQLite `integrity_check` and
`foreign_key_check` pass; one FTS row per recipe; database < 15 MB.
