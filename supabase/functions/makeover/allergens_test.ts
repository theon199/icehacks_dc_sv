import { assertEquals } from "@std/assert";
import { type AllergenId, findAllergenConflicts } from "./allergens.ts";

const hits = (text: string, allergens: AllergenId[]) =>
  findAllergenConflicts([text], allergens).map((conflict) => conflict.allergen);

Deno.test("finds plain allergen ingredients, plurals and inflections", () => {
  assertEquals(hits("2 tbsp unsalted butter", ["milk"]), ["milk"]);
  assertEquals(hits("Whisk 3 large Eggs", ["egg"]), ["egg"]);
  assertEquals(hits("Dust a lightly floured surface", ["wheat"]), ["wheat"]);
  assertEquals(hits("Top with crème fraîche", ["milk"]), ["milk"]);
  assertEquals(hits("A splash of fish sauce", ["fish"]), ["fish"]);
  assertEquals(hits("Garnish with toasted pine nuts", ["tree_nut"]), ["tree_nut"]);
  assertEquals(hits("Drizzle with tahini", ["sesame"]), ["sesame"]);
  assertEquals(hits("1 cup rolled oats", ["gluten"]), ["gluten"]);
  assertEquals(hits("1 cup rolled oats", ["wheat"]), []);
  assertEquals(hits("Season with soy sauce", ["wheat", "soy", "gluten"]), [
    "wheat",
    "soy",
    "gluten",
  ]);
  assertEquals(hits("Add the shrimp", ["shellfish"]), ["shellfish"]);
  assertEquals(hits("Stir in za’atar", ["sesame"]), ["sesame"]);
});

Deno.test("ignores words that only look like allergens", () => {
  assertEquals(hits("Roast the eggplant", ["egg"]), []);
  assertEquals(hits("Grate a little nutmeg over the butternut squash", ["tree_nut", "milk"]), []);
  assertEquals(hits("Stir until creamy", ["milk"]), []);
  assertEquals(hits("Toast the coconut flakes", ["tree_nut"]), []);
  assertEquals(hits("Add sliced water chestnuts", ["tree_nut"]), []);
  assertEquals(hits("Sauté oyster mushrooms", ["shellfish"]), []);
  assertEquals(hits("Crumble firm tofu over the top", ["milk", "egg"]), []);
  assertEquals(hits("Dust with cornflour", ["wheat"]), []);
  assertEquals(hits("Serve over spaghetti squash", ["wheat", "gluten"]), []);
  assertEquals(hits("Wrap in corn tortillas", ["wheat"]), []);
});

Deno.test("plant-based alternatives are safe for the allergen they replace", () => {
  assertEquals(hits("1 can coconut milk", ["milk"]), []);
  assertEquals(hits("Spread with peanut butter", ["milk"]), []);
  assertEquals(hits("Spread with peanut butter", ["peanut"]), ["peanut"]);
  assertEquals(hits("200 g rice noodles", ["wheat", "gluten"]), []);
  assertEquals(hits("1 cup almond flour", ["wheat"]), []);
  assertEquals(hits("1 cup almond flour", ["tree_nut"]), ["tree_nut"]);
  assertEquals(hits("2 flax eggs", ["egg"]), []);
  assertEquals(hits("1 cup oat milk", ["milk"]), []);
  assertEquals(hits("1 cup oat milk", ["gluten"]), ["gluten"]);
});

Deno.test("an explicit qualifier covers the phrase it modifies, and only for its allergen", () => {
  assertEquals(hits("1 cup dairy-free yogurt", ["milk"]), []);
  assertEquals(hits("2 tbsp vegan butter", ["milk"]), []);
  assertEquals(hits("2 tbsp vegan unsalted butter", ["milk"]), []);
  assertEquals(hits("Use vegan mayo", ["egg"]), []);
  assertEquals(hits("egg-free pasta", ["egg"]), []);
  assertEquals(hits("egg-free pasta", ["wheat"]), ["wheat"]);
  assertEquals(hits("gluten-free all-purpose flour", ["gluten"]), []);
  assertEquals(hits("gluten-free all-purpose flour", ["wheat"]), ["wheat"]);
  assertEquals(hits("nut-free pesto", ["tree_nut", "peanut"]), []);
  assertEquals(hits("nut-free pesto", ["milk"]), ["milk"]);
  assertEquals(hits("This version is dairy-free", ["milk"]), []);
  assertEquals(hits("Season the gluten-free noodles", ["gluten"]), []);
  // The qualifier does not reach across clauses.
  assertEquals(hits("dairy-free yogurt, butter", ["milk"]), ["milk"]);
  assertEquals(hits("vegan cheese and butter", ["milk"]), ["milk"]);
  // Text before the qualifier is still checked.
  assertEquals(hits("butter or dairy-free spread", ["milk"]), ["milk"]);
  // Lactose-free and non-dairy products can still contain milk protein.
  assertEquals(hits("lactose-free milk", ["milk"]), ["milk"]);
  assertEquals(hits("non-dairy creamer with casein", ["milk"]), ["milk"]);
});

Deno.test("a qualifier does not hide allergens later in the same sentence", () => {
  assertEquals(hits("Coat the plant-based patties in beaten egg", ["egg"]), ["egg"]);
  assertEquals(
    hits("Serve the vegan burgers topped generously by melted cheddar", ["milk"]),
    ["milk"],
  );
  assertEquals(hits("Top the dairy-free lasagne layers generously in parmesan", ["milk"]), [
    "milk",
  ]);
  assertEquals(hits("gluten-free noodles in beer", ["gluten"]), ["gluten"]);
  assertEquals(hits("vegan pasta drizzled in butter", ["milk"]), ["milk"]);
  assertEquals(hits("dairy-free pancakes topped by whipped cream", ["milk"]), ["milk"]);
});

Deno.test("a qualifier never covers the allergen itself", () => {
  assertEquals(hits("sprinkle sesame-free za'atar", ["sesame"]), ["sesame"]);
  assertEquals(hits("a drizzle of sesame-free tahini", ["sesame"]), ["sesame"]);
  assertEquals(hits("1 cup nut-free almond flour", ["tree_nut"]), ["tree_nut"]);
  assertEquals(hits("200 g gluten-free spelt flour", ["gluten"]), ["gluten"]);
  assertEquals(hits("wheat-free semolina", ["wheat"]), ["wheat"]);
  assertEquals(hits("sesame-free bagels", ["sesame"]), []);
});

Deno.test("breaded and pastry dishes count as wheat and gluten", () => {
  assertEquals(hits("4 fish cakes", ["wheat"]), ["wheat"]);
  assertEquals(hits("2 crab cakes", ["gluten"]), ["gluten"]);
  assertEquals(hits("4 puff pastries", ["wheat"]), ["wheat"]);
  assertEquals(hits("12 pork dumplings", ["wheat", "gluten"]), ["wheat", "gluten"]);
  assertEquals(hits("Toast 2 brioche buns", ["wheat", "egg", "milk"]), ["wheat", "egg", "milk"]);
  assertEquals(hits("2 rice cakes", ["wheat"]), []);
});

Deno.test("pesto and less common seafood are recognised", () => {
  assertEquals(hits("Stir in 2 tbsp basil pesto", ["tree_nut", "milk"]), ["tree_nut", "milk"]);
  assertEquals(hits("4 whitefish fillets", ["fish"]), ["fish"]);
  assertEquals(hits("Pan-fry the sole", ["fish"]), ["fish"]);
  assertEquals(hits("2 flounder fillets", ["fish"]), ["fish"]);
  assertEquals(hits("Grilled eel", ["fish"]), ["fish"]);
  assertEquals(hits("Garlic scampi", ["shellfish"]), ["shellfish"]);
  assertEquals(hits("Sliced abalone", ["shellfish"]), ["shellfish"]);
  assertEquals(hits("A pinch of anchovies", ["fish"]), ["fish"]);
});

Deno.test("reports each allergen once with the term that matched", () => {
  assertEquals(
    findAllergenConflicts(["butter", "2 cups milk", "olive oil"], ["milk", "egg"]),
    [{ allergen: "milk", term: "butter" }],
  );
  assertEquals(findAllergenConflicts(["anything"], []), []);
});

Deno.test("a qualifier stops at the ingredient it modifies, whatever its allergen", () => {
  assertEquals(hits("plant-based milk custard", ["egg"]), ["egg"]);
  assertEquals(hits("vegan butter brioche buns", ["egg"]), ["egg"]);
  assertEquals(hits("vegan mayo tuna salad", ["fish"]), ["fish"]);
  assertEquals(hits("plant-based yogurt shrimp", ["shellfish"]), ["shellfish"]);
  assertEquals(hits("vegan whipped cream meringue", ["egg"]), ["egg"]);
  // Whole multi-word ingredients are still covered.
  assertEquals(hits("2 tbsp dairy-free cream cheese", ["milk"]), []);
  assertEquals(hits("dairy-free sour cream", ["milk"]), []);
  assertEquals(hits("Spread with vegan peanut butter", ["milk"]), []);
  assertEquals(hits("gluten-free all-purpose flour", ["gluten"]), []);
});

Deno.test("gluten-free oats still count as gluten", () => {
  assertEquals(hits("1 cup gluten-free oats", ["gluten"]), ["gluten"]);
  assertEquals(hits("gluten-free rolled oats", ["gluten"]), ["gluten"]);
  assertEquals(hits("200 ml gluten-free oat milk", ["gluten"]), ["gluten"]);
  assertEquals(hits("gluten-free oatmeal", ["gluten"]), ["gluten"]);
  assertEquals(hits("gluten-free porridge oats", ["gluten"]), ["gluten"]);
  assertEquals(hits("gluten-free oats", ["wheat"]), []);
});

Deno.test("a soy-free label never covers soy itself", () => {
  assertEquals(hits("soy-free soy sauce", ["soy"]), ["soy"]);
  assertEquals(hits("soy-free tamari", ["soy"]), ["soy"]);
  assertEquals(hits("soy-free edamame", ["soy"]), ["soy"]);
  assertEquals(hits("soy-free teriyaki", ["soy"]), []);
});

Deno.test("egg dishes, doughs, bakes and compound words are recognised", () => {
  for (const text of ["a spinach omelette", "1 omelet", "pea frittata", "leek quiche"]) {
    assertEquals(hits(text, ["egg"]), ["egg"], text);
  }
  for (
    const text of [
      "500 g pizza dough",
      "Knead the dough",
      "2 slices sourdough",
      "6 bran muffins",
      "buckwheat-free crêpes",
      "1 baguette",
      "soft pretzels",
      "12 cupcakes",
      "garlic breadsticks",
      "glazed doughnuts",
    ]
  ) {
    assertEquals(hits(text, ["wheat", "gluten"]), ["wheat", "gluten"], text);
  }
  assertEquals(hits("a slice of cheesecake", ["milk", "wheat"]), ["milk", "wheat"]);
  assertEquals(hits("a scoop of pistachio gelato", ["milk"]), ["milk"]);
  assertEquals(hits("Pour over the béchamel", ["milk"]), ["milk"]);
  assertEquals(hits("Pipe the buttercream", ["milk"]), ["milk"]);
});
