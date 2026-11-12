import { createPublishHandler, defaultPublishDeps } from "./handler.ts";

Deno.serve(createPublishHandler(defaultPublishDeps()));
