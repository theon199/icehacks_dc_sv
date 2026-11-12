import { denoEnv, readEnv } from "../_shared/env.ts";
import { createHandler } from "../_shared/http.ts";
import { ExpoPushClient } from "./expo.ts";
import { authenticateWithSupabase, createPushHandler } from "./handler.ts";
import { createPostgresStore } from "./store.ts";

const accessToken = readEnv(["EXPO_ACCESS_TOKEN"]);
const sender = new ExpoPushClient(accessToken ? { accessToken } : {});
const store = createPostgresStore(denoEnv);

/** Supabase's edge runtime lets work continue after the response; absent when run elsewhere. */
const runtime = (globalThis as { EdgeRuntime?: { waitUntil(work: Promise<unknown>): void } })
  .EdgeRuntime;

Deno.serve(
  createHandler(
    createPushHandler({
      env: denoEnv,
      store: () => store,
      sender: () => sender,
      authenticate: authenticateWithSupabase,
      log: (message, context) => console.info(JSON.stringify({ message, ...context })),
      ...(runtime ? { background: (work: Promise<unknown>) => runtime.waitUntil(work) } : {}),
    }),
  ),
);
