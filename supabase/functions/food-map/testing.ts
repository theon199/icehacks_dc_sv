/** Test fixtures for the food map functions. Not imported by any function entry point. */

import type { Position, Ring } from "./geo.ts";

/** A closed, counter-clockwise ring approximating a circle (`points` distinct positions). */
export function circleRing(lng: number, lat: number, radiusDeg: number, points: number): Ring {
  const ring: Ring = [];
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    ring.push([lng + radiusDeg * Math.cos(angle), lat + radiusDeg * Math.sin(angle)]);
  }
  ring.push([...ring[0]!] as Position);
  return ring;
}

export const square = (lng: number, lat: number, half: number): Ring => [
  [lng - half, lat - half],
  [lng + half, lat - half],
  [lng + half, lat + half],
  [lng - half, lat + half],
  [lng - half, lat - half],
];

/** Overpass `out geom` point list for a line. */
export const geom = (line: readonly Position[]) => line.map(([lon, lat]) => ({ lat, lon }));

/** A named multipolygon relation whose outline is split into ways (some reversed). */
export function relationElement(
  id: number,
  name: string,
  ring: Ring,
  options: { tags?: Record<string, string>; holes?: Ring[]; split?: number } = {},
) {
  const split = options.split ?? 3;
  const size = Math.ceil((ring.length - 1) / split);
  const members: Array<Record<string, unknown>> = [];
  for (let start = 0; start < ring.length - 1; start += size) {
    const part = ring.slice(start, Math.min(start + size, ring.length - 1) + 1);
    // Every other way runs the opposite way, as OSM ways often do.
    const line = members.length % 2 === 1 ? [...part].reverse() : part;
    members.push({
      type: "way",
      ref: id * 100 + members.length,
      role: "outer",
      geometry: geom(line),
    });
  }
  for (const hole of options.holes ?? []) {
    members.push({
      type: "way",
      ref: id * 100 + members.length,
      role: "inner",
      geometry: geom(hole),
    });
  }
  members.push({ type: "node", ref: 1, role: "label", lat: ring[0]![1], lon: ring[0]![0] });
  return {
    type: "relation",
    id,
    tags: {
      type: "boundary",
      boundary: "administrative",
      admin_level: "10",
      name,
      ...options.tags,
    },
    members,
  };
}
