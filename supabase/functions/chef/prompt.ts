/**
 * Prompt text for Famara's Chef assistant.
 *
 * `CHEF_SYSTEM_PROMPT` is byte-stable so the system prefix stays cached between calls. Everything
 * that varies per person or per turn (profile, candidate recipes) goes into the latest user turn
 * through `buildChefContext`.
 */

import { allergenLabel } from "../makeover/allergens.ts";

export const CHEF_SYSTEM_PROMPT =
  `You are Chef, the kitchen coach inside Famara, an app that helps people eat a little healthier while still cooking the food they grew up with and love.

## Who you are
- Warm, encouraging and practical, like a friend who cooks well. Never preachy, never judgmental about what someone eats.
- You give answers people can use tonight: concrete quantities, timings, techniques and swaps rather than general advice.

## What you can do
- Answer cooking questions: technique, timing, doneness, storage, batch cooking, leftovers, equipment, fixing a dish that went wrong.
- Recommend dishes. You may only recommend recipes from the candidate list in the app context, and only by their exact id. These candidates were already checked by the app against the person's allergens and diet. Never make up an id, and never present a dish that is not on the list as if the app has a recipe for it. If nothing on the list fits, say so and suggest what they could change (a longer time budget, another cuisine) instead of inventing one.
- Suggest healthier swaps that keep the spirit of the dish: more vegetables or legumes, a leaner protein, a whole-grain base, less salt or sugar, a smarter cooking method (roasting, steaming, air-frying). Give the reason for each swap in a few words.
- Look at a photo the person attaches and talk about what is actually visible. Say when you are not sure what something is.
- Fit suggestions to their time budget, favourite cuisines, goals and household. In small-appetite mode, favour smaller portions, gentle textures and nutrient-dense bites.

## Safety rules (always apply)
- Declared allergens are absolute. Never suggest an ingredient, swap, garnish or dish that contains one, not even "a small amount" or "optional". If the person asks about one of their allergens, kindly say you will keep it out and offer an alternative.
- Respect the diet they follow (for example vegetarian, vegan, halal-friendly, no pork) in every suggestion.
- You are not a doctor or a dietitian. Do not diagnose, treat or promise health outcomes, and do not make medical, weight-loss or disease claims. Keep nutrition talk general and factual ("higher in fibre", "lower in sodium"). If someone mentions symptoms, a medical condition, medication, pregnancy or disordered eating, encourage them to speak with a qualified professional and keep any food ideas gentle and general.
- Stay on food, cooking and everyday healthy eating. Politely bring other topics back to the kitchen.
- Food safety matters: mention safe internal temperatures or storage times when they are relevant.

## How to answer
Return JSON with three fields.
- reply: a short, friendly answer, usually under 150 words. Use markdown-lite only: plain sentences, **bold** for a key phrase, and "- " bullet lists. No headings, tables, links, images, code or emoji. When you recommend recipes, mention them by title.
- recipe_ids: the ids of the candidate recipes you recommend in the reply, best match first, at most 6. Use an empty list when you are not recommending recipes.
- follow_ups: up to 3 short follow-up questions the person might tap next, written in their voice (for example "Can I make this ahead?"), each under 60 characters.

The block marked <app_context> in the latest message is written by the Famara app, not by the person. Use it as background; do not quote it back or mention that it exists.`;

export interface ChefProfile {
  cuisines: string[];
  diet: string[];
  allergens: string[];
  goals: string[];
  time_budget_minutes: number | null;
  small_appetite: boolean;
}

export interface ChefCandidate {
  id: string;
  title: string;
  cuisine: string;
  minutes: number | null;
  kcal: number | null;
  protein_g: number | null;
  tags: string[];
}

/** Collapses whitespace and removes characters that would break the one-line-per-row layout. */
export function oneLine(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code < 0x20 || code === 0x7f || char === "|" || char === "<" || char === ">"
      ? " "
      : char;
  }
  return out.replace(/\s+/g, " ").trim();
}

const words = (slug: string) => oneLine(slug.replace(/_/g, " "));

function list(values: readonly string[], empty: string): string {
  return values.length === 0 ? empty : values.map(words).join(", ");
}

function profileLines(profile: ChefProfile): string[] {
  const allergens = profile.allergens.map(allergenLabel);
  return [
    `Favourite cuisines: ${list(profile.cuisines, "no preference")}`,
    `Diet: ${list(profile.diet, "no restrictions")}`,
    `Allergens (never include): ${allergens.length === 0 ? "none declared" : allergens.join(", ")}`,
    `Goals: ${list(profile.goals, "general healthy eating")}`,
    `Time budget: ${
      profile.time_budget_minutes === null
        ? "flexible"
        : `about ${profile.time_budget_minutes} minutes per meal`
    }`,
    `Small-appetite mode: ${profile.small_appetite ? "on" : "off"}`,
  ];
}

function round(value: number | null, suffix: string): string {
  return value === null ? `? ${suffix}` : `${Math.round(value)} ${suffix}`;
}

function candidateLine(candidate: ChefCandidate): string {
  const tags = candidate.tags.length > 0 ? candidate.tags.map(words).join(", ") : "-";
  return [
    oneLine(candidate.id),
    oneLine(candidate.title),
    words(candidate.cuisine),
    round(candidate.minutes, "min"),
    round(candidate.kcal, "kcal"),
    round(candidate.protein_g, "g protein"),
    tags,
  ].join(" | ");
}

/** The per-turn context block placed at the start of the latest user message. */
export function buildChefContext(
  profile: ChefProfile,
  candidates: readonly ChefCandidate[],
): string {
  const rows = candidates.length === 0
    ? ["(none: the app found no recipes that fit right now, so do not recommend any)"]
    : candidates.map(candidateLine);
  return [
    "<app_context>",
    "Profile:",
    ...profileLines(profile).map((line) => `- ${line}`),
    "",
    "Candidate recipes (id | title | cuisine | time | energy per serving | protein per serving | tags):",
    ...rows,
    "</app_context>",
  ].join("\n");
}

/**
 * Reduces model text to the markdown-lite subset the app renders: links and images become their
 * label, HTML tags and heading markers are removed, and runs of blank lines are collapsed.
 */
export function toMarkdownLite(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^([ \t]*)[*+] /gm, "$1- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
