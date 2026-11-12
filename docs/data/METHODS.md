# Famara catalog — how derived fields are computed

Every field in the catalog that a source does not publish directly is computed by a deterministic
rule in `tools/data/src`. Same inputs, same output — no model, no randomness. This page is the
reference for those rules; the code comments repeat the key numbers next to the implementation.

## 1. Ingredient lines

**Measures** (`parse/measure.ts`). A leading amount is read as a number (`2`, `1.5`, `1 1/2`,
`1 and 1/2`, unicode fractions such as `½`, word numbers such as `two` or `half`), an optional range
(`2-3`, `2 to 4` → the midpoint), an optional size word (`small`, `medium`, `large`) and an
optional unit. Units are normalised (`tbs`, `Tblsp`, capital `T` → `tbsp`; `t` → `tsp`; `tin` →
`can`; `cl`/`dl` → `ml`). Unicode fractions keep the whole number before them (`1½` and `1 ½` are
1.5). Package sizes are understood (`1 x 400g tin`, `2 (14.5 ounce) cans`, `1 – 14-ounce can`,
which is one can rather than a range of 1–14), and a bracketed weight after a count gives the size of
each item (`1 (12 oz.) stir-fry vegetables` = 12 oz, `2 (6 oz) fillets` = 12 oz). A second, smaller
mass adds to the first (`1 lb 2 oz`), and so does a second volume after *plus*
(`1 cup plus 2 tablespoons` = 1.125 cups). A weight written after a household measure is preferred to it:
after a container it is the size of each one (`1 can (28 ounces)`, `2 cans (15 ounces each)`),
otherwise the line total (`2 cups (about 300g)`). An equal volume (`1 cup (250ml)`) or a trailing
alternative after a mass (`175g/6oz`) keeps the first measure. Phrases such as *to taste*, *for
frying*, *garnish*, *as needed* mark a line as unquantified.

**Matching** (`match/`). Text is lower-cased, accent-folded, stripped of punctuation and simply
singularised. The matcher finds the longest known phrase (up to 7 words) from the ingredient
synonym index, so *low-sodium soy sauce* beats *soy sauce*, and *ground beef* beats *beef*. The
primary ingredient is taken from the part before the first comma; preparation notes are only
searched when that part names nothing. Every ingredient the whole line mentions — alternatives
(*butter or margarine*) and asides (*cooked protein (ham, chicken or tofu)*) — feeds the safety
roll-ups below. A line with no match keeps `ingredient_id = NULL`.

**Choices and listed items.** A line that offers choices or lists items (*peanut butter or halva
spread*, *salt and pepper*, *(or 2 tsp sugar)*, *, or to taste*) is split at *or*, *and*, *plus* and
slashes, and each choice is resolved on its own. A word shared between choices is read as part of
each one: *chicken or vegetable stock* offers chicken stock, *chicken thighs or 2 breasts* offers
chicken breasts, and the amount belongs to the first choice, so the line's ingredient is chicken
stock. Every word of a choice must then be part of a known ingredient, an amount or a description
(*fresh*, *thawed*, *cut into cubes*). A choice made only of amounts, comments and descriptions (*or
to taste*, *or more if needed*, *fresh or frozen*, *tidbits or chunks*) adds nothing. A choice is
unidentified when it names no known ingredient (*halva spread*), when a word is left over beside a
known one (*cookie* in *cookie butter*, *vegan* in *vegan mayo*, *spread* in *hazelnut spread*),
when it is a stand-in (*or substitute*, *butter substitute*, *or equivalent*, *or similar*), or when
it is open-ended and names nothing (*or other fat*, *or your favourite*, *or any other kind*, *or
topping*). Open-ended words next to a known ingredient only widen it (*raisins or other dried fruit*
is identified), and a blend of the other choices (*or a mix*, *or both*, *or a combination*) is
identified only when the line names at least two known choices. A leading *substitute* is the verb
(*or substitute frozen blueberries*). An unidentified choice is recorded as an `unresolved_choice`
build note: the line keeps its known ingredients, which still count as contained, and its primary
ingredient for weights and nutrition, but its other allergens and its diets fail closed (section 5).

A synonym that covers a whole "A or B" phrase (*chicken or vegetable bouillon*) decides that line on
its own, so the build checks every such synonym against each alternative it hides (*chicken*,
*chicken bouillon*, *vegetable bouillon*): the entry may not claim a diet flag an alternative lacks,
and must list every allergen an alternative contains unless it is a variable product. A synonym
that would fail open stops the build.

**Weights** (`derive/ingredients.ts`). Grams come from, in order: a mass unit in the text; the
ingredient's own table weights (`units`); USDA household portions for the matched FDC food
(*cup, chopped*, *tbsp*, *large*, *clove*, a portion named after the food itself, …); a cup weight
derived from a tablespoon/teaspoon portion; a category cup weight (e.g. produce 150 g, liquids
240 g). Spoons are derived from the cup by volume. Small and large items are 0.75× and 1.3× a medium
one. Container and approximate units fall back to generic weights (can 400 g, bunch 60 g, handful
30 g, knob 15 g, slice 30 g …). The resolved table is stored per ingredient in `grams_per_unit`.
When USDA lists several cup portions for one food, a *fluid* cup is preferred and a *whipped* cup is
used last, because recipes measure cream and similar liquids as poured (heavy cream: 238 g, not
120 g). Table weights override USDA portions whose labels describe a whole package rather than one
item (mixed vegetables 100 g per piece, vegetable broth 240 g).

**Concentrates.** Stock cubes and bouillon powders name a ready-to-use stock (`preparedAs`). When
a line measures 60 ml or more of a concentrate (*250ml vegetable stock cube*), its weight and
nutrients are those of the prepared stock; the line keeps the concentrate as its ingredient for
allergens, diets and shopping. Ordinary stock cubes use USDA's regular bouillon foods (about
24,000–26,000 mg sodium per 100 g); the low-sodium bouillon food is used only for lines that say
low sodium.

## 2. Nutrition

Per-100 g nutrients come from the ingredient's FDC food: energy (1008, else 2048/2047, else
Atwater 4/4/9), protein (1003), fat (1004/1085), carbohydrate (1005/1050), fibre (1079), total
sugars (2000/1063), saturated fat (1258) and sodium (1093). A nutrient USDA does not report for an
ingredient counts as zero in that ingredient's contribution.

A recipe total is the sum over lines with a known weight. When a line says *salt to taste*, 1.5 g of
salt is added once per recipe. Plain water and ice add weight to nothing.

**Frying oil.** Oil used as a frying medium mostly stays in the pan, so it does not count in full.
An oil line is a frying medium when its text says so (*oil for frying*, *2 quarts neutral frying
oil*, *Fry Oil*) or when it weighs at least 120 g and the title or method fries anything (*fry*,
*fried*, *deep-fry*, *shallow-fry*, *deep fat*, *hot oil*; *stir-fry* and the noun *frying pan* do
not count). All
frying-medium lines together contribute 15 % of their weight, capped at 15 % of the weight of the
other food in the recipe, split between them by weight. This absorbed amount — not the measured
amount — feeds nutrition, the portion weight and the servings estimate, which therefore run after
this rule. The ingredient row keeps the measured weight. Oil that is part of a batter, dough,
dressing or cake (no frying in the method) counts in full.

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
at or below 55 g. Light dishes such as clear broths may fall below the energy range rather than
collapse into one huge bowl: a serving never weighs more than twice the typical portion. With an
unknown weight the estimate is 4. Recipes with estimated servings always
carry `nutrition_confidence = 'estimated'`.

**Time.** MedlinePlus publishes prep, cook and total time; `total_minutes` is the total (or
prep + cook) and `active_minutes` the prep time, unless the published prep time is over 60 minutes:
that figure includes hands-off soaking, chilling or marinating (overnight oats list 12 hours), so
active time is estimated as for TheMealDB instead. For TheMealDB: preparation = 5 min + 1.5 min per
ingredient line (max 40); cooking = the sum of step timers, or a per-course default when no step
names a duration (main/soup/dessert 30, side 20, breakfast 15, snack 10, salad/drink 0); total =
preparation + cooking; active = preparation + 15 % of cooking (at most +30 min, since proving,
chilling or marinating is hands-off). Both are rounded to 5 minutes.

**Timers** (`parse/steps.ts`). A step's `timer_seconds` is the longest duration it names
(`simmer 20 minutes`, `bake 1 hour 15 minutes`, `1h30`, `soak for twenty-four hours`, `a few minutes` = 3).
Ranges use the lower bound so the cook checks early. Durations after *within*, *every*, *up to*,
*than*, *first*, *last* or *over* are advice, not timers. Timers are 5 seconds to 24 hours.

**Steps.** Instructions are split on line breaks, except that a line ending mid-sentence (no closing
punctuation) is joined to the next when that one starts in lower case, which undoes hard-wrapped
source text; `STEP n` labels, numbering, bullets and checkbox glyphs (▢) are removed; sub-headings ending in a colon are merged into the next step; paragraphs over 420
characters are regrouped by sentence. A recipe written as a single paragraph of three or more
sentences is regrouped into steps of at most two sentences (≤ 200 characters) for cook mode.

**Effort** (1 easy … 3 involved). Points: ingredient lines > 8 → 1, > 12 → 2; steps > 5 → 1, > 8 → 2;
active minutes > 25 → 1, > 45 → 2; +1 for an involved technique (deep-frying, kneading, proving,
laminating, tempering, sugar thermometer, blind baking, rolling out, piping, caramel, choux,
overnight marinating). 0–1 points → 1, 2–3 → 2, 4+ → 3.

## 4. Classification

**Course.** Drinks are detected by title first (smoothie, shake, juice, lemonade, cooler …, unless
the title is clearly food such as *fudge* or *glazed*). MedlinePlus index pages map in priority
order drinks → dips, salsas and sauces (snack) → soups → salads → desserts → breakfast →
dinner/lunch (main) → side dishes/breads (side) → snacks (snack). Dips and sauces come early because
MedlinePlus also files them under meal listings, and a 20 kcal ranch dip is not a main dish. TheMealDB: *Dessert* → dessert; then title words for soup and salad;
*Breakfast* → breakfast, *Side* → side, *Starter* → snack, sauces in *Miscellaneous* → side;
everything else → main. From either source, a *main* that brings under 150 kcal per serving is
listed as a *side* (a 20 kcal spaghetti-squash dish is eaten alongside something else).

**Cuisine and region.** In order: TheMealDB's area (country or demonym, e.g. *United States*,
*Norway*, *Saudi Arabian*); a country or demonym in the title (*Cambodian Fish Curry*); dish words
(enchilada → Mexican, risotto → Italian, pad thai → Thai, …); otherwise *American* for MedlinePlus
and *International* for TheMealDB. Ingredient names that contain a country word (*Swiss chard*,
*French fries*, *Turkish delight*, *turkey*) are ignored. Each cuisine belongs to one of 16 regions
(`knowledge/cuisines.ts`).

**Families.** `family_id` is `fam:` + the sorted set of title words after removing variant words
(easy, healthy, classic, baked, grilled, slow cooker, recipe …), so *Easy Meatballs* and *Baked
Meatballs* share a family. Words that change the dish rather than describe a version of it, such as
*sweet* (sweet potato) and *fried* (fried rice), are kept.

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
line is unmatched, offers a choice that names no known ingredient, or any ingredient is `unknown`,
otherwise `free`. When every choice is known, the recipe contains the union of their allergens
(*butter or margarine spread* contains milk and soy).

Diet flags are the intersection of every named ingredient's flags; an unmatched line, or one with an
unidentified choice, clears all of them. Flags read the ingredient list only: a serving suggestion
in the method (*top with prawns or salmon*) is optional and does not change them, so a recipe can be
vegetarian as written while a step mentions a non-vegetarian variation. Vegan is never claimed for
variable products; *no pork* / *no beef* / *halal-friendly* are never claimed with gelatin or
unspecified meat; gluten-free and dairy-free also require the recipe's gluten / milk status to be
`free`. Halal-friendly means no pork, no alcohol and no gelatin or unspecified meat — informational
only, not a certification.

**Title cross-check.** Some source lists omit the main ingredient (*… Pork Belly* with no pork
line). Proteins, dairy, nuts and seeds named in the title whose diet or allergen effect is missing
from the list are added to the roll-ups, unless the title says it is vegan, vegetarian or "…-free".

**Owner decisions** (recorded so they can be revisited deliberately):

- *Peanut and groundnut oil* contain peanut. Highly refined peanut oil is exempt from U.S. allergen
  labelling, but a recipe line never says the oil is refined, so Famara fails closed.
- *Vanilla extract* is not marked as alcohol. Its alcohol is a flavouring carrier used in teaspoon
  amounts and largely evaporates in baking, so recipes using it can still be `no_alcohol` and
  `halal_friendly`. Wine, beer, spirits, mirin and cooking wines are marked as alcohol.
- *Parmesan* (and pecorino, grana padano) counts as vegetarian. Traditional versions use animal
  rennet; Famara follows the common household reading of "vegetarian" (no meat, poultry or fish)
  and leaves rennet out of scope, as it does for other cheeses.
- *Store-bought broths* (chicken, beef, vegetable) are not variable products, while stock cubes,
  bouillon powders and gravy granules are. Plain ready-to-serve broths are usually just stock and
  salt; concentrates are where wheat, milk, soy and celery fillers appear. The diet effect of the
  named animal (chicken, beef) always applies.
- *Unspecified meat products* claim no meat-related diet: sausages, hot dogs, frankfurters,
  kielbasa and kidneys that do not name their animal, and stock cubes or bouillon that do not name
  their base, are `mixed` (they may be pork, beef, chicken or a blend). Named forms (*pork
  sausages*, *lamb kidneys*, *vegetable stock cube*, *beef bouillon*) keep their animal or stay
  vegetarian.
- *Ribbon pastas* (fettuccine, tagliatelle, pappardelle) and fresh pasta count as egg pasta: they
  are traditionally made with egg, so Famara tags egg rather than guess per brand. Potato gnocchi
  is its own variable entry (wheat; egg and milk unknown).
- *Lamb and mutton stock* have their own entry (lamb), so they no longer count as beef; *veal stock*
  stays with beef broth.

## 6. Goals, gentle and health score

**Goal tags** (per serving; require reported nutrition except `plant_forward`; a tag whose input
nutrient is unknown is not awarded):

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
bakes, braises, mashes or blends), no frying in oil, no charring, not billed as very spicy, not a
drink. Frying in oil means: a frying verb in the title, deep or shallow frying, *hot oil* or
fritters anywhere in the text, a line of oil used as a frying medium (see §2), or fries as an
ingredient. Softening onions in a spoonful of oil does not count.

**Health score** (`tools/data/src/score.ts`, 0–1): rewards — fibre per 100 kcal (full at 1.4 g),
protein per 100 kcal (full at 5 g), produce + legume share of food weight (full at 50 %); penalties
— sodium per 100 kcal (from 50 mg, full at 250 mg), saturated-fat share of energy (from 7 %, full at
20 %), added-sugar share of energy (from 5 %, full at 25 %). Score = clamp(0.5 + 0.5 × mean(rewards)
− 0.5 × mean(penalties)), three decimals. A term whose nutrient is unknown is left out of its mean
rather than counted as zero. Without nutrition: 0.3 + 0.4 × plant reward.

## 7. Summary

One or two sentences built only from catalog fields: cuisine, course, up to three key ingredients
(those the title names first — including one made from a food the title names, such as peanut
butter in a peanut soup — then the heaviest, skipping aromatics, fats, flours and eggs unless
the title names them), total time, and one standout fact chosen in order: protein (if
`high_protein`), fibre (`high_fiber`), energy (`lower_calorie`, ≤ 350 kcal), sodium
(`lower_sodium`), plant-forward, otherwise energy. No health claims.

## 8. Tutorials

TheMealDB `strYoutube` becomes a `video` (canonical `https://www.youtube.com/watch?v=<11-char id>`)
and `strSource` a `web` link; MedlinePlus recipes link to their own page. URLs must be valid
http(s). During `npm run fetch`, videos are checked with YouTube oEmbed (missing → dropped; the
title is kept when available) and web links with a HEAD request (404/410 or a host that no longer
resolves → dropped; bot blocks and server errors keep the link). Plain-http web links are also
requested over https; when that answers with a success or redirect status the catalog stores the
https address (for tutorials and `source_url`), otherwise the original address is kept.

## 8a. Search

The full-text index holds the title, the cuisine label and, for each matched ingredient line, as
unique words (`pipeline/search.ts`):

- the head noun of the ingredient's name (*oil* for vegetable oil) and its curated aliases
  (`knowledge/searchAliases.ts`: true equivalents only, so *garbanzo*, *aubergine* or *courgette*
  find recipes whose lines say chickpeas, eggplant or zucchini). A one-word alias is indexed as
  is; a multi-word alias adds only its words that are foods on their own (a one-word ingredient
  name, plural, synonym or alias) and are not listed descriptors (`ALIAS_DESCRIPTORS`). So
  "coriander leaves" adds *coriander* but not *leaves*, "plain flour" adds *flour* but not
  *plain*, and "half and half" adds nothing, which keeps searches such as *french*, *plain* or
  *sweet potato* from returning recipes that merely contain green beans, flour or peppers;
- other words of the ingredient's name only when the line uses them (*vegetable* for "vegetable
  oil", not for "sunflower oil");
- the line's own words that belong to one of the ingredient's matching synonyms (*penne* from
  "300 g penne"), except a word that is another ingredient's one-word name (*beef* in "beef
  tomatoes").

Matching synonyms are not indexed wholesale: many are varieties (*rigatoni* under pasta),
compound phrases (*chicken or vegetable broth*) or name other foods, and would make a search
return recipes that do not contain what was asked for.

## 9. Quality gates

`npm run build` fails unless all of these hold: knowledge tables validate; every FDC id exists and
its description matches; no synonym maps to two ingredients; no "A or B" synonym is less
restrictive than an alternative it hides; every `preparedAs` names an ingredient; no word indexed from a search alias is a cuisine label,
cuisine place name or listed descriptor, and every alias entry names a known ingredient and
indexes at least one word; substitutions reference known
ingredients, are unique and have notes; unique recipe ids and slugs; every recipe has ≥ 1
ingredient and ≥ 1 step; enums are valid (course, cuisine, region, confidence, goal tags, allergen
states, diet bits, effort 1–3); servings 1–48; active ≤ total minutes; health score 0–1; nutrient
values non-negative, saturated fat ≤ fat, sodium ≤ 8,000 mg, protein energy ≤ total energy, energy
within the ranges above; no `free` allergen or diet flag on a recipe with an unmatched line or an
unidentified choice; every
`ingredient_id` exists; ≥ 98 % of ingredient lines matched; SQLite `integrity_check` and
`foreign_key_check` pass; one FTS row per recipe; database < 15 MB.

The database and manifest are written to `*.staging` files next to the assets and moved into place
only after every gate, including the post-write SQLite checks and the size limit, has passed, so a
failing build leaves the committed catalog untouched.
