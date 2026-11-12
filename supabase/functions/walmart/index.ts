import { createWalmartHandler, defaultWalmartDeps } from "./handler.ts";

Deno.serve(createWalmartHandler(defaultWalmartDeps()));
