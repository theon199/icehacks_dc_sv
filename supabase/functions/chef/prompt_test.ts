import { assertEquals, assertStringIncludes } from "@std/assert";
import { ALLERGENS_UNANSWERED_LINE, buildChefContext, type ChefProfile } from "./prompt.ts";

const ANSWERED: ChefProfile = {
  cuisines: ["thai"],
  diet: ["vegetarian"],
  allergens: ["peanut"],
  goals: ["more_protein"],
  time_budget_minutes: 30,
  small_appetite: false,
  allergens_answered: true,
};

const profileBlock = (profile: ChefProfile) =>
  buildChefContext(profile, []).split("\n").filter((line) => line.startsWith("- "));

Deno.test("answered allergens are listed as never include", () => {
  const lines = profileBlock(ANSWERED);
  assertEquals(lines.includes("- Allergens (never include): peanut"), true, lines.join("\n"));
  assertEquals(lines.includes("- Diet: vegetarian"), true);
});

Deno.test("an answered empty list means none declared", () => {
  const lines = profileBlock({ ...ANSWERED, allergens: [], diet: [] });
  assertEquals(lines.includes("- Allergens (never include): none declared"), true);
  assertEquals(lines.includes("- Diet: no restrictions"), true);
});

Deno.test("unanswered allergens are treated as possible, never as none", () => {
  const lines = profileBlock({ ...ANSWERED, allergens: [], diet: [], allergens_answered: false });
  assertEquals(
    ALLERGENS_UNANSWERED_LINE,
    "Allergens: not answered yet. Treat every allergen as possible and never claim a dish is allergen-free.",
  );
  assertEquals(lines.includes(`- ${ALLERGENS_UNANSWERED_LINE}`), true);
  assertEquals(lines.some((line) => line.includes("none declared")), false);
  assertEquals(lines.some((line) => line.startsWith("- Diet: not answered yet")), true);
});

Deno.test("allergens named before the questions are answered stay excluded", () => {
  const context = buildChefContext({ ...ANSWERED, allergens_answered: false }, []);
  assertStringIncludes(context, ALLERGENS_UNANSWERED_LINE);
  assertStringIncludes(context, "Mentioned so far (never include): peanut");
  assertStringIncludes(context, "- Diet: vegetarian");
});
