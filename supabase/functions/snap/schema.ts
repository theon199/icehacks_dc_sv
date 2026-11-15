/**
 * Shapes the `snap` function reads: the three request bodies the app may send, and the JSON the
 * model is asked to fill in for each of them.
 */

import { z } from "zod";

/**
 * Bounds of a fridge sweep. Mirrors `SNAP_SWEEP_LIMITS` in the app's `src/lib/api/ai.ts`, and the
 * batch and words limits enforced by `spend_snap_sweep_*` (migration `20261115090000_snap_sweeps`);
 * all three must change together.
 */
export const SWEEP_LIMITS = {
  framesPerBatch: 3,
  maxFrames: 12,
  maxTextCalls: 2,
  textMaxChars: 600,
} as const;

/** Batches one sweep may send: the frames of a full pass, packed three to a batch. */
export const SWEEP_MAX_BATCHES = SWEEP_LIMITS.maxFrames / SWEEP_LIMITS.framesPerBatch;

export const SNAP_LIMITS = {
  /** Decoded photo size. The app sends a downscaled JPEG, usually well under 1 MB. */
  maxImageBytes: 3_000_000,
  /** One photo as base64 (3 MB decoded is 4 MB of text), with room for a `data:` prefix. */
  maxImageChars: 4_200_000,
  /** Largest body: a sweep batch of three full-size photos. */
  maxBodyBytes: 12_700_000,
  maxItems: 40,
  maxKeyIngredients: 12,
  maxNameChars: 60,
  timeoutMs: 60_000,
  maxTokens: 6_000,
  /** Items read out of a few sentences: a short, fast reply. */
  textMaxTokens: 2_000,
} as const;

export const PANTRY_UNITS = [
  "piece",
  "g",
  "kg",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
  "bunch",
  "head",
  "clove",
  "slice",
  "can",
  "jar",
  "bottle",
  "bag",
  "box",
  "pack",
  "carton",
  "dozen",
] as const;
export type PantryUnit = (typeof PANTRY_UNITS)[number];

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

/** Base64 JPEG, PNG or WebP (a `data:` URL prefix is accepted). HEIC must be converted. */
const imageData = () => z.string().min(1).max(SNAP_LIMITS.maxImageChars);

/** One photo, in either mode. */
export const SnapPhotoInputSchema = z.strictObject({
  mode: z.enum(["pantry", "dish"]),
  image: imageData(),
  /** Optional hint typed by the person, e.g. "homemade, half portion". */
  note: z.string().trim().max(200).optional(),
});

/** One batch of stills from a fridge sweep; every batch of a pass carries the same `sweep_id`. */
export const SnapSweepInputSchema = z.strictObject({
  mode: z.literal("pantry"),
  sweep_id: z.uuid(),
  images: z.array(imageData()).min(1).max(SWEEP_LIMITS.framesPerBatch),
});

/** Items the person said or typed. With a `sweep_id`, the words belong to that pass. */
export const SnapTextInputSchema = z.strictObject({
  mode: z.literal("pantry"),
  sweep_id: z.uuid().optional(),
  text: z.string().trim().min(1).max(SWEEP_LIMITS.textMaxChars),
});

export const SnapInputSchema = z.union([
  SnapPhotoInputSchema,
  SnapSweepInputSchema,
  SnapTextInputSchema,
]);

export type SnapPhotoInput = z.output<typeof SnapPhotoInputSchema>;
export type SnapSweepInput = z.output<typeof SnapSweepInputSchema>;
export type SnapTextInput = z.output<typeof SnapTextInputSchema>;
export type SnapInput = z.output<typeof SnapInputSchema>;

// ---------------------------------------------------------------------------------------------
// Model output
// ---------------------------------------------------------------------------------------------

export const PhotoKind = z.enum(["food", "not_food", "unclear"]);

const range = () => z.object({ estimate: z.number(), low: z.number(), high: z.number() });

function nutritionSchema() {
  return z.object({
    kcal: range(),
    protein_g: range(),
    carbs_g: range(),
    fat_g: range(),
    fiber_g: range(),
    sodium_mg: range(),
  });
}

/** Sent to Claude: units are an enum so structured outputs keep them to the known list. */
const pantryModelItem = () =>
  z.object({
    name: z.string(),
    quantity: z.number().nullable(),
    unit: z.enum(PANTRY_UNITS).nullable(),
    confidence: z.number(),
  });

/** Read back loosely; `normalizePantry` drops or repairs anything out of range. */
const pantryReadItem = () =>
  z.object({
    name: z.string(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    confidence: z.number(),
  });

export const PantryModelSchema = z.object({
  photo: PhotoKind,
  items: z.array(pantryModelItem()),
});

export const PantryReadSchema = z.object({
  photo: PhotoKind,
  items: z.array(pantryReadItem()),
});

/** Words have no photo to classify: an empty list means nothing in them was food. */
export const TextModelSchema = z.object({ items: z.array(pantryModelItem()) });
export const TextReadSchema = z.object({ items: z.array(pantryReadItem()) });

export type PantryReadItem = z.output<ReturnType<typeof pantryReadItem>>;

export const DishModelSchema = z.object({
  photo: PhotoKind,
  dish: z.object({
    name: z.string(),
    cuisine: z.string().nullable(),
    key_ingredients: z.array(z.string()),
    portion: z.string(),
    nutrition: nutritionSchema(),
    confidence: z.number(),
  }).nullable(),
});
