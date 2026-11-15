import { createPlacePhotoHandler, defaultPlacePhotoDeps } from "./handler.ts";

Deno.serve(createPlacePhotoHandler(defaultPlacePhotoDeps()));
