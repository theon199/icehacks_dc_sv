import { assertEquals } from "@std/assert";
import {
  decodeEntities,
  durationMinutes,
  ingredientName,
  pageText,
  recipeFromJsonLd,
  servingsFrom,
  stepsFrom,
} from "./page.ts";

const page = (jsonLd: unknown, extra = "") =>
  `<html><head><title>Adobo | Site</title><script type="application/ld+json">${
    JSON.stringify(jsonLd)
  }</script></head><body>${extra}</body></html>`;

Deno.test("reads a schema.org Recipe from JSON-LD inside a @graph", () => {
  const html = page({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: "Site" },
      {
        "@type": ["Recipe", "NewsArticle"],
        name: "Chicken Adobo &amp; Rice",
        recipeYield: ["4", "4 servings"],
        totalTime: "PT1H5M",
        recipeCuisine: ["Filipino"],
        recipeCategory: "Main Course",
        recipeIngredient: ["2 lb chicken thighs", "1/3 cup <b>cane</b> vinegar"],
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "Marinate",
            itemListElement: [{ "@type": "HowToStep", text: "Combine everything." }],
          },
          { "@type": "HowToStep", text: "Simmer for 40 minutes." },
        ],
      },
    ],
  });
  assertEquals(recipeFromJsonLd(html), {
    title: "Chicken Adobo & Rice",
    servings: 4,
    total_minutes: 65,
    cuisine: "Filipino",
    meal: "dinner",
    ingredients: ["2 lb chicken thighs", "1/3 cup cane vinegar"],
    steps: ["Combine everything.", "Simmer for 40 minutes."],
  });
});

Deno.test("adds prep and cook time when total time is missing", () => {
  const html = page({
    "@type": "Recipe",
    name: "Oats",
    prepTime: "PT5M",
    cookTime: "PT10M",
    recipeIngredient: ["1 cup oats"],
    recipeInstructions: "Cook the oats.<br>Serve.",
  });
  const recipe = recipeFromJsonLd(html);
  assertEquals(recipe?.total_minutes, 15);
  assertEquals(recipe?.servings, null);
  assertEquals(recipe?.steps, ["Cook the oats.", "Serve."]);
});

Deno.test("ignores pages without a usable Recipe, and broken JSON-LD", () => {
  assertEquals(recipeFromJsonLd(page({ "@type": "Article", name: "News" })), null);
  assertEquals(recipeFromJsonLd(page({ "@type": "Recipe", name: "No steps" })), null);
  assertEquals(
    recipeFromJsonLd('<script type="application/ld+json">{ not json</script>'),
    null,
  );
});

Deno.test("parses durations and yields", () => {
  assertEquals(durationMinutes("PT1H30M"), 90);
  assertEquals(durationMinutes("P0DT45M"), 45);
  assertEquals(durationMinutes("PT"), null);
  assertEquals(durationMinutes("45 minutes"), null);
  assertEquals(servingsFrom("Serves 6"), 6);
  assertEquals(servingsFrom(3), 3);
  assertEquals(servingsFrom("a crowd"), null);
});

Deno.test("reads instruction text, lists and nested sections", () => {
  assertEquals(stepsFrom(["Boil.", { text: "Drain." }]), ["Boil.", "Drain."]);
  assertEquals(stepsFrom("<p>One</p><p>Two</p>"), ["One", "Two"]);
});

Deno.test("decodes entities", () => {
  assertEquals(decodeEntities("&frac12; cup &amp; a &#x2F; &#39;"), "½ cup & a / '");
});

Deno.test("keeps only readable text, without scripts and styles", () => {
  const text = pageText(
    `<html><head><title>Adobo</title><style>p{}</style></head><body><nav>Home</nav>
     <script>alert(1)</script><h1>Adobo</h1><ul><li>Chicken</li><li>Vinegar</li></ul>
     <p>Simmer &amp; serve.</p><footer>Copyright</footer></body></html>`,
  );
  assertEquals(text, "Adobo\nAdobo\n- Chicken\n- Vinegar\nSimmer & serve.");
});

Deno.test("names the plain ingredient in a line", () => {
  const cases: [string, string][] = [
    ["1/3 cup cane vinegar", "cane vinegar"],
    ["2 cloves garlic, minced", "garlic"],
    ["3 garlic cloves", "garlic"],
    ["1 (14 oz) can diced tomatoes, drained", "diced tomatoes"],
    ["½ tsp salt, or to taste", "salt"],
    ["400g chickpeas", "chickpeas"],
    ["Salt and pepper to taste", "salt and pepper"],
    ["2 large eggs", "large eggs"],
    ["A handful of basil leaves", "basil leaves"],
    ["1 cup butter or margarine", "butter or margarine"],
  ];
  for (const [line, name] of cases) assertEquals(ingredientName(line), name, line);
});
