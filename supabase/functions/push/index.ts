import { denoEnv, readEnv } from "../_shared/env.ts";
import { createHandler } from "../_shared/http.ts";
import { ExpoPushClient } from "./expo.ts";
import { authenticateWithSupabase, createPushHandler } from "./handler.ts";
import { createPostgresStore } from "./store.ts";

const accessToken = readEnv(["EXPO_ACCESS_TOKEN"]);
const sender = new ExpoPushClient(accessToken ? { accessToken } : {});
const store = createPostgresStore(denoEnv);

Deno.serve(
  createHandler(
    createPushHandler({
      env: denoEnv,
      store: () => store,
      sender: () => sender,
      authenticate: authenticateWithSupabase,
      log: (message, context) => console.info(JSON.stringify({ message, ...context })),
    }),
  ),
);
