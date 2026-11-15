/** zod shapes shared by the food map functions. */

import { z } from "zod";

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Rings of [lng, lat]: the outline first, then holes; each closed with at least 4 positions. */
export const polygonSchema = z.array(
  z.array(position).min(4).refine(
    (ring) =>
      ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1],
    "Rings must be closed.",
  ),
).min(1);
