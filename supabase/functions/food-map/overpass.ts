/**
 * Neighbourhood outlines from OpenStreetMap through the Overpass API.
 *
 * One query per fill covers the bounding box of the cells being filled: administrative
 * boundaries at admin_level 9 or 10, and `place=neighbourhood|quarter|suburb` areas (relations or
 * closed ways). `out geom` returns member geometry inline, and the multipolygon members are
 * joined here into closed rings. OSM data is ODbL: the map credits "© OpenStreetMap
 * contributors" wherever these outlines are shown.
 */

import { z } from "zod";
import { HttpError } from "../_shared/http.ts";
import type { BBox, Polygon, Position, Ring } from "./geo.ts";
import { pointInRing, signedRingArea } from "./geo.ts";

export const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** Overpass asks clients to identify themselves. */
export const DEFAULT_USER_AGENT = "Famara-FoodMap/1.0 (Supabase edge function)";
const SERVER_TIMEOUT_S = 30;
const CLIENT_TIMEOUT_MS = 40_000;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;

/** The Overpass QL for a box (south, west, north, east). */
export function overpassQuery(box: BBox): string {
  const [w, s, e, n] = box.map((v) => v.toFixed(6));
  const area = `(${s},${w},${n},${e})`;
  return [
    `[out:json][timeout:${SERVER_TIMEOUT_S}];`,
    "(",
    `  relation["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"]${area};`,
    `  relation["place"~"^(neighbourhood|quarter|suburb)$"]["name"]${area};`,
    `  way["place"~"^(neighbourhood|quarter|suburb)$"]["name"]${area};`,
    ");",
    "out geom;",
  ].join("\n");
}

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) });
const tags = z.record(z.string(), z.string()).optional();
const member = z.looseObject({
  type: z.string(),
  role: z.string().optional(),
  geometry: z.array(point.nullable()).optional(),
});
const element = z.looseObject({
  type: z.string(),
  id: z.number().int().nonnegative(),
  tags,
  geometry: z.array(point.nullable()).optional(),
  members: z.array(z.unknown()).optional(),
});
const responseSchema = z.looseObject({ elements: z.array(z.unknown()) });

export interface OsmArea {
  /** `osm:relation:<id>` or `osm:way:<id>`. */
  ref: string;
  name: string;
  /** Outline first, then holes; closed rings in [lng, lat]. */
  polygon: Polygon;
}

const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

function toLine(geometry: ReadonlyArray<z.infer<typeof point> | null>): Position[] | null {
  const line: Position[] = [];
  for (const p of geometry) {
    if (p === null) return null; // a member outside the response: the way is incomplete
    const next: Position = [p.lon, p.lat];
    if (line.length === 0 || !samePosition(line[line.length - 1]!, next)) line.push(next);
  }
  return line.length >= 2 ? line : null;
}

/**
 * Joins way segments end to end into closed rings. Segments that never close are dropped, so a
 * relation clipped by missing members yields only its complete rings.
 */
export function assembleRings(lines: readonly Position[][]): Ring[] {
  const rings: Ring[] = [];
  const open: Position[][] = [];
  for (const line of lines) {
    if (line.length >= 4 && samePosition(line[0]!, line[line.length - 1]!)) rings.push(line);
    else open.push(line);
  }
  while (open.length > 0) {
    let current = open.shift()!;
    let grew = true;
    while (!samePosition(current[0]!, current[current.length - 1]!) && grew) {
      grew = false;
      const end = current[current.length - 1]!;
      for (let i = 0; i < open.length; i++) {
        const candidate = open[i]!;
        if (samePosition(candidate[0]!, end)) {
          current = [...current, ...candidate.slice(1)];
        } else if (samePosition(candidate[candidate.length - 1]!, end)) {
          current = [...current, ...[...candidate].reverse().slice(1)];
        } else {
          continue;
        }
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (current.length >= 4 && samePosition(current[0]!, current[current.length - 1]!)) {
      rings.push(current);
    }
  }
  return rings;
}

/**
 * The polygon a relation stands for: its largest outer ring and the inner rings inside it. Other
 * outer rings (exclaves) are left out, because a region has one outline.
 */
export function relationPolygon(members: readonly unknown[]): Polygon | null {
  const outer: Position[][] = [];
  const inner: Position[][] = [];
  for (const raw of members) {
    const parsed = member.safeParse(raw);
    if (!parsed.success || parsed.data.type !== "way" || !parsed.data.geometry) continue;
    const role = parsed.data.role ?? "";
    if (role !== "outer" && role !== "inner" && role !== "") continue;
    const line = toLine(parsed.data.geometry);
    if (!line) continue;
    (role === "inner" ? inner : outer).push(line);
  }
  const outlines = assembleRings(outer)
    .map((ring) => ({ ring, area: Math.abs(signedRingArea(ring)) }))
    .sort((a, b) => b.area - a.area);
  const main = outlines[0];
  if (!main || main.area <= 0) return null;
  const holes = assembleRings(inner).filter((hole) =>
    pointInRing({ lng: hole[0]![0], lat: hole[0]![1] }, main.ring)
  );
  return [main.ring, ...holes];
}

/** Named areas from an Overpass response; elements without a usable outline are skipped. */
export function parseOverpass(body: unknown): OsmArea[] {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError("upstream_error", "The map data service returned an unexpected response.");
  }
  const areas: OsmArea[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.data.elements) {
    const el = element.safeParse(raw);
    if (!el.success) continue;
    const name = el.data.tags?.name?.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!name) continue;
    let polygon: Polygon | null = null;
    if (el.data.type === "relation" && el.data.members) {
      polygon = relationPolygon(el.data.members);
    } else if (el.data.type === "way" && el.data.geometry) {
      const line = toLine(el.data.geometry);
      const ring = line ? assembleRings([line])[0] : undefined;
      polygon = ring ? [ring] : null;
    }
    if (!polygon) continue;
    const ref = `osm:${el.data.type}:${el.data.id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    areas.push({ ref, name, polygon });
  }
  return areas;
}

export interface OverpassRequest {
  box: BBox;
  url: string;
  userAgent: string;
  fetch?: typeof fetch;
}

function busy(message: string, retryAfter: string | null): HttpError {
  return new HttpError("upstream_unavailable", message, {
    headers: { "Retry-After": retryAfter && /^\d{1,4}$/.test(retryAfter) ? retryAfter : "30" },
    details: { reason: "map_data_unavailable" },
  });
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let step = await reader.read(); !step.done; step = await reader.read()) {
    size += step.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new HttpError("upstream_error", "The map data for this area is too large.");
    }
    chunks.push(step.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Runs the query. 429 and 5xx (Overpass answers 504 when it is overloaded) and network failures
 * become 503 with Retry-After, a timeout 504, anything else 502.
 */
export async function fetchOsmAreas(req: OverpassRequest): Promise<OsmArea[]> {
  const doFetch = req.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": req.userAgent,
      },
      body: new URLSearchParams({ data: overpassQuery(req.box) }).toString(),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HttpError("upstream_timeout", "Map data took too long. Try again.");
    }
    console.error("overpass request failed", error instanceof Error ? error.name : "unknown");
    throw busy("Map data could not be reached. Try again shortly.", null);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    console.error("overpass error", { status: res.status });
    if (res.status === 429 || res.status >= 500) {
      throw busy("Map data is busy. Try again shortly.", res.headers.get("retry-after"));
    }
    throw new HttpError("upstream_error", "Map data could not answer that request.");
  }
  let body: unknown;
  try {
    body = JSON.parse(await readCapped(res));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("upstream_error", "Map data returned an unreadable response.");
  }
  return parseOverpass(body);
}
