import { createFoodCheckInHandler, defaultFoodCheckInDeps } from "./handler.ts";

Deno.serve(createFoodCheckInHandler(defaultFoodCheckInDeps()));
