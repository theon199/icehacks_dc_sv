# push

Registers devices for push notifications and delivers inbox notifications through the Expo Push API.

| Route                 | Caller                  | Auth                             | Body                                                                                   |
| --------------------- | ----------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /push`          | the app                 | member session (`Authorization`) | `{ action: "register", token, platform }` or `{ action: "unregister", token }`         |
| `POST /push/dispatch` | the database via pg_net | `x-famara-push-secret` header    | `{ messages: PushJob[] }`, built by `private.push_batch` for each notifications insert |

Both routes authenticate inside the function, so deploy it without the gateway JWT check:

```sh
supabase functions deploy push --no-verify-jwt
supabase secrets set FAMARA_PUSH_SECRET=<long random string>
# optional, only for projects with enhanced push security turned on in Expo:
supabase secrets set EXPO_ACCESS_TOKEN=<token>
```

Then tell the database where to send new notifications (SQL editor, once per project):

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push/dispatch', 'famara_push_url');
select vault.create_secret('<the same long random string>', 'famara_push_secret');
```

Without those two Vault secrets, or without the `pg_net` extension, the trigger does nothing and
notification inserts are unaffected.

## Delivery

- Each statement that inserts notifications produces one request with every recipient device.
- Every device gets its own message; messages go out in batches of 100 (the Expo limit per request),
  with retries and backoff on throttling and server errors.
- Tickets that report `DeviceNotRegistered` remove that token from `private.push_tokens`.
- Lock-screen copy never contains moderation reasons; the app shows those after opening.
- Each message's `data` carries only ids (`notification_id`, `recipient_id`, `kind`, `actor_id`,
  `post_id`, `comment_id`, `action_id`); the app routes taps from them.

## Storage

Tokens live in `private.push_tokens` (not exposed through the Data API). The function reaches them
over `SUPABASE_DB_URL`, which the platform provides to edge functions, through
`private.register_push_token`, `private.unregister_push_token` and `private.forget_push_tokens`. An
account keeps at most ten devices; a token registered by a new account on the same device moves to
that account.

## Checks

```sh
cd supabase/functions
deno check push/*.ts
deno test --allow-env push
```
