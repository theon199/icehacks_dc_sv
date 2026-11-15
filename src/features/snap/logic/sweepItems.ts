/**
 * The live list of a fridge sweep. Each batch of frames, and each thing the person says, returns
 * its own item list; they merge here into one list with no item twice, newest first, each item
 * remembering whether the video or the person's words found it.
 */
import type { SnapPantryItem } from '@/lib/api/ai';

import { roundQty } from './pantryDraft';
import { capitalize, nameKey } from './words';

export type SweepOrigin = 'video' | 'said';

export interface SweepItem {
  /** Stable for the whole pass: one item per food name. */
  key: string;
  name: string;
  quantity: number | null;
  unit: SnapPantryItem['unit'];
  confidence: number;
  origin: SweepOrigin;
  /** When it first appeared on the list, for the brief "New" tag. */
  foundAt: number;
}

/** More than a full fridge; keeps a runaway reading from growing the list without end. */
export const SWEEP_MAX_ITEMS = 80;

/** How long a newly found item keeps its "New" tag. */
export const FRESH_MS = 2500;

export interface MergeResult {
  items: SweepItem[];
  /** Keys of items this merge put on the list for the first time. */
  added: string[];
}

/**
 * Merges one reading into the list. The same food (by its singular, filler-free name) is listed
 * once: a later, more confident reading updates its amount; an amount the person said always
 * wins over one guessed from the video. New items go to the top.
 */
export function mergeSweepItems(
  items: readonly SweepItem[],
  incoming: readonly SnapPantryItem[],
  origin: SweepOrigin,
  now: number,
): MergeResult {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const fresh = new Map<string, SweepItem>();
  let changed = false;
  for (const reading of incoming) {
    const key = nameKey(reading.name);
    if (!key) continue;
    const quantity = roundQty(reading.quantity);
    const unit = quantity == null ? null : reading.unit;
    const home = fresh.has(key) ? fresh : byKey;
    const existing = home.get(key);
    if (existing) {
      const said = origin === 'said' && quantity != null;
      if (!said && reading.confidence <= existing.confidence) continue;
      home.set(key, {
        ...existing,
        quantity: quantity ?? existing.quantity,
        unit: quantity == null ? existing.unit : unit,
        confidence: Math.max(existing.confidence, reading.confidence),
      });
      changed = true;
      continue;
    }
    if (byKey.size + fresh.size >= SWEEP_MAX_ITEMS) continue;
    fresh.set(key, {
      key,
      name: capitalize(reading.name.trim()),
      quantity,
      unit,
      confidence: reading.confidence,
      origin,
      foundAt: now,
    });
    changed = true;
  }
  if (!changed) return { items: [...items], added: [] };
  return { items: [...fresh.values(), ...byKey.values()], added: [...fresh.keys()] };
}

/** Keys still wearing the "New" tag at `now`. */
export function freshKeys(items: readonly SweepItem[], now: number): ReadonlySet<string> {
  return new Set(items.filter((item) => now - item.foundAt < FRESH_MS).map((item) => item.key));
}

/** Milliseconds until the next "New" tag should come off, or null when none is showing. */
export function nextFreshExpiry(items: readonly SweepItem[], now: number): number | null {
  let soonest: number | null = null;
  for (const item of items) {
    const left = item.foundAt + FRESH_MS - now;
    if (left > 0 && (soonest === null || left < soonest)) soonest = left;
  }
  return soonest;
}

/** "Eggs, 10" or "Milk, 1 carton": the name with its amount, as the live list shows it. */
export function sweepItemLabel(item: SweepItem): string {
  if (item.quantity == null) return item.name;
  const amount =
    item.unit == null || item.unit === 'piece'
      ? String(item.quantity)
      : `${item.quantity} ${item.unit}`;
  return `${item.name}, ${amount}`;
}

export function countByOrigin(items: readonly SweepItem[], origin: SweepOrigin): number {
  return items.reduce((count, item) => (item.origin === origin ? count + 1 : count), 0);
}
