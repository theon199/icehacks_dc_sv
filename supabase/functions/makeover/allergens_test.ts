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

Deno.test("an explicit qualifier covers the rest of its clause, and only for its allergen", () => {
  assertEquals(hits("1 cup dairy-free yogurt", ["milk"]), []);
  assertEquals(hits("2 tbsp vegan butter", ["milk"]), []);
  assertEquals(hits("Use vegan mayo", ["egg"]), []);
  assertEquals(hits("egg-free pasta", ["egg"]), []);
  assertEquals(hits("egg-free pasta", ["wheat"]), ["wheat"]);
  assertEquals(hits("gluten-free all-purpose flour", ["gluten"]), []);
  assertEquals(hits("gluten-free all-purpose flour", ["wheat"]), ["wheat"]);
  assertEquals(hits("nut-free pesto", ["tree_nut", "peanut"]), []);
  // The qualifier does not reach across clauses.
  assertEquals(hits("dairy-free yogurt, butter", ["milk"]), ["milk"]);
  assertEquals(hits("vegan cheese and butter", ["milk"]), ["milk"]);
  // Text before the qualifier is still checked.
  assertEquals(hits("butter or dairy-free spread", ["milk"]), ["milk"]);
  // Lactose-free and non-dairy products can still contain milk protein.
  assertEquals(hits("lactose-free milk", ["milk"]), ["milk"]);
  assertEquals(hits("non-dairy creamer with casein", ["milk"]), ["milk"]);
});

Deno.test("reports each allergen once with the term that matched", () => {
  assertEquals(
    findAllergenConflicts(["butter", "2 cups milk", "olive oil"], ["milk", "egg"]),
    [{ allergen: "milk", term: "butter" }],
  );
  assertEquals(findAllergenConflicts(["anything"], []), []);
});
