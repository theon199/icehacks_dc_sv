import { createFoodMapHandler, defaultFoodMapDeps } from "./handler.ts";

Deno.serve(createFoodMapHandler(defaultFoodMapDeps()));
