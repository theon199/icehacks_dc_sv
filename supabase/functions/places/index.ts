import { createPlacesHandler, defaultPlacesDeps } from "./handler.ts";

Deno.serve(createPlacesHandler(defaultPlacesDeps()));
