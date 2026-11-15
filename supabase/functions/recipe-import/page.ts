/**
 * Reading a recipe out of a web page: the schema.org `Recipe` in its JSON-LD when the page has
 * one (most recipe sites do), otherwise the page's visible text for the model to read.
 *
 * Everything here is plain string work on untrusted HTML: nothing is executed or rendered, and
 * every value is cleaned to plain text before it is used.
 */

export interface RecipeDraft {
  title: string;
  servings: number | null;
  total_minutes: number | null;
  cuisine: string | null;
  meal: "breakfast" | "lunch" | "dinner" | "snack" | null;
  /** Ingredient lines as written. */
  ingredients: string[];
  steps: string[];
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  deg: "°",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  frac13: "⅓",
  frac23: "⅔",
  times: "×",
  eacute: "é",
  egrave: "è",
  ntilde: "ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Plain text on one line: tags removed, entities decoded, whitespace collapsed. */
export function plainText(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------------------------

const MAX_NODES = 2_000;
const MAX_DEPTH = 8;

/** The JSON values of every `application/ld+json` script on the page that parses. */
export function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern =
    /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const body = (match[1] ?? "").trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    try {
      blocks.push(JSON.parse(body));
    } catch {
      // A broken block on the page says nothing about the recipe; the text fallback still runs.
    }
  }
  return blocks;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isRecipeType(type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((entry) => typeof entry === "string" && /(^|[/:#])recipe$/i.test(entry.trim()));
}

/** The first schema.org Recipe node, searching arrays, `@graph` and nested objects. */
export function findRecipeNode(values: readonly unknown[]): Record<string, unknown> | null {
  const queue: { value: unknown; depth: number }[] = values.map((value) => ({ value, depth: 0 }));
  let visited = 0;
  while (queue.length > 0 && visited < MAX_NODES) {
    const { value, depth } = queue.shift() as { value: unknown; depth: number };
    visited++;
    if (depth > MAX_DEPTH) continue;
    if (Array.isArray(value)) {
      for (const item of value) queue.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (!isRecord(value)) continue;
    if (isRecipeType(value["@type"])) return value;
    for (const child of Object.values(value)) {
      if (typeof child === "object" && child !== null) {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return null;
}

function texts(value: unknown): string[] {
  if (typeof value === "string") return [plainText(value)].filter(Boolean);
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (isRecord(value)) {
    for (const key of ["name", "text", "@value"]) {
      if (typeof value[key] === "string") return texts(value[key]);
    }
  }
  return [];
}

/** Minutes in an ISO 8601 duration ("PT1H30M", "P0DT45M"), or null. */
export function durationMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
      .exec(value.trim());
  if (!match || match[0] === "P" || /T$/i.test(value.trim())) return null;
  const [, days, hours, minutes, seconds] = match;
  const total = Number(days ?? 0) * 1440 + Number(hours ?? 0) * 60 + Number(minutes ?? 0) +
    Number(seconds ?? 0) / 60;
  return total > 0 ? Math.round(total) : null;
}

/** Servings from `recipeYield`: 4, "4", "Serves 4", "4-6 servings", ["4", "4 servings"]. */
export function servingsFrom(value: unknown): number | null {
  for (const entry of Array.isArray(value) ? value : [value]) {
    if (typeof entry === "number" && Number.isFinite(entry) && entry > 0) return Math.round(entry);
    if (typeof entry === "string") {
      const match = /\d+/.exec(entry);
      if (match) {
        const count = Number(match[0]);
        if (count > 0) return count;
      }
    }
  }
  return null;
}

/** `recipeCategory` mapped onto Famara's meals; null when it names none of them. */
export function mealFrom(value: unknown): RecipeDraft["meal"] {
  const words = texts(value).join(" ").toLowerCase();
  if (/\b(breakfast|brunch)\b/.test(words)) return "breakfast";
  if (/\blunch\b/.test(words)) return "lunch";
  if (/\b(dinner|supper|main|mains|entree|entrée)\b/.test(words)) return "dinner";
  if (/\b(snack|snacks|appetizer|appetiser|starter)\b/.test(words)) return "snack";
  return null;
}

/** Steps from `recipeInstructions`: text, a list of strings, HowToStep and HowToSection. */
export function stepsFrom(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === "string") {
    return decodeEntities(value.replace(/<\s*(br|\/p|\/li)\b[^>]*>/gi, "\n"))
      .split(/\n+/)
      .map(plainText)
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap((item) => stepsFrom(item, depth + 1));
  if (isRecord(value)) {
    if (value.itemListElement !== undefined) return stepsFrom(value.itemListElement, depth + 1);
    if (typeof value.text === "string") return stepsFrom(value.text, depth + 1);
    if (typeof value.name === "string") return stepsFrom(value.name, depth + 1);
  }
  return [];
}

/** The page's JSON-LD recipe as a draft, or null when it has none with ingredients and steps. */
export function recipeFromJsonLd(html: string): RecipeDraft | null {
  const node = findRecipeNode(jsonLdBlocks(html));
  if (!node) return null;
  const title = texts(node.name)[0] ?? "";
  const ingredients = texts(node.recipeIngredient ?? node.ingredients);
  const steps = stepsFrom(node.recipeInstructions);
  if (title === "" || ingredients.length === 0 || steps.length === 0) return null;
  const total = durationMinutes(node.totalTime);
  const parts = [durationMinutes(node.prepTime), durationMinutes(node.cookTime)];
  const summed = parts.some((part) => part !== null)
    ? parts.reduce<number>((sum, part) => sum + (part ?? 0), 0)
    : null;
  return {
    title,
    servings: servingsFrom(node.recipeYield),
    total_minutes: total ?? summed,
    cuisine: texts(node.recipeCuisine)[0] ?? null,
    meal: mealFrom(node.recipeCategory),
    ingredients,
    steps,
  };
}

// ---------------------------------------------------------------------------------------------
// Visible text
// ---------------------------------------------------------------------------------------------

export const PAGE_TEXT_MAX_CHARS = 30_000;

export interface PageText {
  readonly text: string;
  /**
   * False when the readable text is longer than Famara sends and even its ingredients part does
   * not fit: reading only part of the page could miss an ingredient, so it is never imported.
   */
  readonly complete: boolean;
}

/** A line that may be an ingredient: a list item, or a line that starts with an amount ("2 tbsp", "½ cup"). */
function looksLikeIngredient(line: string): boolean {
  return /^-\s/.test(line) || /^\p{N}/u.test(line);
}

/** A heading line that starts the ingredients ("Ingredients", "Ingredients for the sauce"). */
const INGREDIENTS_HEADING = /^(?:-\s*)?ingredients?\b.{0,40}$/i;

/**
 * The page's readable text, one block per line, without scripts, styles or markup. A page longer
 * than `maxChars` is read from its ingredients heading on, when that part fits; otherwise it is
 * reported as not complete.
 */
export function pageText(html: string, maxChars: number = PAGE_TEXT_MAX_CHARS): PageText {
  const title = plainText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|template|iframe|head|nav|footer|form)\b[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ");
  const lines = decodeEntities(body.replace(/<[^>]*>/g, " "))
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const whole = [title, ...lines].filter(Boolean).join("\n");
  if (whole.length <= maxChars) return { text: whole, complete: true };
  // Read from the ingredients heading only when it is the page's one ingredients heading and
  // nothing before it looks like an ingredient line (a sauce listed above the story, say).
  const headings = lines.flatMap((line, index) => (INGREDIENTS_HEADING.test(line) ? [index] : []));
  const from = headings.length === 1 ? headings[0] ?? -1 : -1;
  if (from >= 0 && !lines.slice(0, from).some(looksLikeIngredient)) {
    const part = [title, ...lines.slice(from)].filter(Boolean).join("\n");
    if (part.length <= maxChars) return { text: part, complete: true };
  }
  return { text: whole.slice(0, maxChars), complete: false };
}

// ---------------------------------------------------------------------------------------------
// Ingredient names
// ---------------------------------------------------------------------------------------------

const UNITS = new Set([
  "c",
  "cup",
  "cups",
  "tbsp",
  "tbs",
  "tbsps",
  "tablespoon",
  "tablespoons",
  "tsp",
  "tsps",
  "teaspoon",
  "teaspoons",
  "g",
  "gram",
  "grams",
  "kg",
  "kilogram",
  "kilograms",
  "mg",
  "ml",
  "milliliter",
  "milliliters",
  "millilitre",
  "millilitres",
  "l",
  "liter",
  "liters",
  "litre",
  "litres",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "pint",
  "pints",
  "quart",
  "quarts",
  "qt",
  "gallon",
  "gallons",
  "pinch",
  "pinches",
  "dash",
  "dashes",
  "handful",
  "handfuls",
  "clove",
  "cloves",
  "can",
  "cans",
  "tin",
  "tins",
  "jar",
  "jars",
  "package",
  "packages",
  "packet",
  "packets",
  "pkg",
  "stick",
  "sticks",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "bunch",
  "bunches",
  "head",
  "heads",
  "piece",
  "pieces",
  "stalk",
  "stalks",
  "bag",
  "bags",
  "box",
  "boxes",
  "bottle",
  "bottles",
  "cube",
  "cubes",
  "knob",
  "drop",
  "drops",
  "splash",
  "sheet",
  "sheets",
  "x",
  "heaped",
  "heaping",
  "level",
  "scant",
  "generous",
  "of",
  "a",
  "an",
  "about",
  "approx",
  "approximately",
]);
/** Words after the food that say how much of it, not what it is ("garlic cloves"). */
const TRAILING_UNITS = new Set(["clove", "cloves", "sprig", "sprigs", "stalk", "stalks", "head"]);
const QUANTITY = /^[\d½¼¾⅓⅔⅛⅜⅝⅞.,/\-–~+]+$/;
const NUMBER_WORDS = new Set(["one", "two", "three", "four", "five", "six", "half", "quarter"]);

/** The plain ingredient in a line: "2 cloves garlic, minced" becomes "garlic". */
export function ingredientName(line: string): string {
  const cleaned = plainText(line)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[,;]| - | – /)[0] ?? "";
  const words = cleaned
    .replace(/\b(to taste|for garnish|for serving|to serve|optional|divided)\b.*$/, "")
    .replace(/(\d)([a-z]+)\b/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  while (
    words.length > 0 &&
    (QUANTITY.test(words[0] as string) || UNITS.has(words[0] as string) ||
      NUMBER_WORDS.has(words[0] as string))
  ) {
    words.shift();
  }
  while (words.length > 1 && TRAILING_UNITS.has(words[words.length - 1] as string)) words.pop();
  const name = words.join(" ").trim();
  return name !== "" ? name : plainText(line).toLowerCase();
}
