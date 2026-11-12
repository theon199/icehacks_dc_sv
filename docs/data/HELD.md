# Famara catalog — held content

Content Famara does not have yet because no public source provides it in a form Famara can use.
Nothing on this list is filled in with invented data; the app shows these gaps honestly (for
example an "estimated" nutrition label, or no tutorial link) until a real source exists.

## Not available from any public source today

| Held content | Why it is held | What the app does meanwhile |
| --- | --- | --- |
| Step-by-step photos | Neither recipe source publishes per-step images | Cook mode shows text steps with timers |
| Hero photos for recipes without one | All 1,031 recipes in this build have a source photo; future additions without one stay photo-less rather than using a stock or generated image | Show a neutral placeholder |
| Published servings, prep and cook times for TheMealDB recipes | The source has no servings or times | Servings and times are estimated by documented rules (`METHODS.md` §3); nutrition is labelled `estimated` |
| Lab-verified or label-verified allergen information per recipe | Sources list ingredients, not tested allergen content or brand labels | Fail-closed roll-up: unmatched or brand-variable ingredients make allergens `unknown`, which the app treats as unsafe |
| "May contain" / cross-contact information | Depends on the brand a cook buys | Variable store-bought products are `unknown` for every allergen they do not certainly contain |
| Added sugars measured per ingredient | USDA FPED reports added sugars per survey food code, which does not map onto the FDC foods the catalog uses | Added sugars are estimated from sweetener ingredients, or taken from the MedlinePlus label when printed |
| Nutrition for a few ingredients with no USDA food | No FDC entry for ackee, doner kebab meat, banana or pandan leaves, lime or curry leaves, food colouring | Leaves and colourings count as negligible; recipes relying on ackee or doner meat may fall below the coverage threshold and show no nutrition |
| Nutrition for 19 recipes | Too many of their ingredient weights could not be resolved (below 80 % coverage) | `nutrition_confidence = 'none'`; the app hides the nutrition panel and goal tags that need it |
| Verified restaurant menus | No public, licensable dataset of what restaurants serve | Nearby search relies on live place search, not catalog data |
| Recipe costs and prices | No public price dataset is bundled | Computed at runtime by the app's pricing feature |
| Additional curated cuisines | Public sources are thin for South Asian (20 recipes), Sub-Saharan African (9) and Central Asian (0) cooking, and 113 TheMealDB recipes carry no country | Those dishes are labelled *International*; more recipes need a new public source |
| Community or editor-written healthier adaptations | Must come from real people or Famara's own reviewed recipes, never generated in bulk | The makeover feature adapts recipes on request; substitutions come from the reviewed swap table |
| Translations of recipes | Sources are English only | English text |
| Wikimedia Commons starter photos | Not used in this catalog build; each file would need its own licence and attribution record | No community starter photos are bundled |

## Sources that were checked but not used

| Source | Result |
| --- | --- |
| USDA FoodData Central Foundation Foods, October 2026 CSV bundle | Ships sample tables only (no `food`, `food_nutrient` or `food_portion` CSV); the April 2026 bundle is pinned instead |
| USDA Food Patterns Equivalents Database (FPED) | Accessible, but keyed by survey food codes rather than FDC foods; see added sugars above |
| Robots and rate limits | No source blocked the builder; MedlinePlus `robots.txt` disallows none of the recipe paths used |

## Links removed by validation

Tutorial links are checked during `npm run fetch` (`METHODS.md` §8). Videos YouTube reports as
missing and pages that return 404/410 or whose host no longer resolves are left out of
`recipe_tutorials`; the full list is printed by `npm run report -- --full` (`tutorial_dropped`).
