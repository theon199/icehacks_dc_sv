import { createPricesHandler, defaultPricesDeps } from "./handler.ts";

Deno.serve(createPricesHandler(defaultPricesDeps()));
