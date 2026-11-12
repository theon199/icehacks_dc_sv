/**
 * `publish`: create a community post or comment after an AI text review.
 *
 * POST { type: "post", kind, title, body?, recipe_ref?, rating?, parent_post_id?, visibility?,
 *        media?: [{ path, width, height, blurhash? }] }
 * POST { type: "comment", post_id, body, parent_comment_id? }
 *
 * Steps: validate the input; check that every photo is an upload in the caller's own
 * `post-media/<uid>/` folder; review the text (moderation.ts); record the verdict with the
 * service role (`record_text_review`); then call `publish_post` / `add_comment` as the caller, so
 * the author is always the caller and the RPCs' own checks apply (age gate, suspension,
 * visibility, rate limits, review terms).
 *
 * The database fails closed: it publishes visibly only when it finds a fresh, single-use allow
 * for this member and this exact text. Anything else (a hold verdict, a direct RPC call, a
 * failed review) is stored hidden pending a moderator, with an automated report that carries the
 * review's category and that the author can appeal. Returns the created row and whether it was
 * held.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AnthropicClient } from "../_shared/anthropic.ts";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, consumeQuota } from "../_shared/quota.ts";
import { callRpc, rpcErrorToHttp } from "../_shared/rpc.ts";
import { formatIssues, parseBody } from "../_shared/validate.ts";
import { type ReviewOutcome, reviewText } from "./moderation.ts";

export const MEDIA_BUCKET = "post-media";
/** Seconds an allow stays usable; the RPC call follows straight after it is recorded. */
export const VERDICT_TTL_SECONDS = 120;

const uuid = z.uuid();
const MEDIA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

const mediaItem = z.object({
  path: z.string().min(3).max(300),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  blurhash: z.string().max(100).optional(),
});

export const PublishInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("post"),
    kind: z.enum(["cook", "remix", "tip"]),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(2000).default(""),
    recipe_ref: z.string().trim().min(1).max(128).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    parent_post_id: uuid.optional(),
    visibility: z.enum(["public", "followers"]).default("public"),
    media: z.array(mediaItem).max(4).default([]),
  }).superRefine((post, ctx) => {
    if (post.kind !== "tip" && !post.recipe_ref) {
      ctx.addIssue({
        code: "custom",
        path: ["recipe_ref"],
        message: "Cook and remix posts need a recipe.",
      });
    }
    if (post.kind === "tip" && post.rating !== undefined) {
      ctx.addIssue({ code: "custom", path: ["rating"], message: "Tips cannot have a rating." });
    }
    const paths = post.media.map((m) => m.path);
    if (new Set(paths).size !== paths.length) {
      ctx.addIssue({
        code: "custom",
        path: ["media"],
        message: "Each photo can be attached once.",
      });
    }
  }),
  z.object({
    type: z.literal("comment"),
    post_id: uuid,
    body: z.string().trim().min(1).max(1000),
    parent_comment_id: uuid.optional(),
  }),
]);
export type PublishInput = z.output<typeof PublishInput>;
export type PostInput = Extract<PublishInput, { type: "post" }>;
export type CommentInput = Extract<PublishInput, { type: "comment" }>;

export const postRowSchema = z.looseObject({
  id: z.string(),
  author_id: z.string(),
  kind: z.enum(["cook", "remix", "tip"]),
  title: z.string(),
  body: z.string(),
  recipe_ref: z.string().nullable(),
  rating: z.number().nullable(),
  visibility: z.enum(["public", "followers"]),
  status: z.enum(["visible", "hidden", "removed"]),
  parent_post_id: z.string().nullable(),
  like_count: z.number(),
  comment_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PostRow = z.output<typeof postRowSchema>;

export const commentRowSchema = z.looseObject({
  id: z.string(),
  post_id: z.string(),
  author_id: z.string(),
  parent_comment_id: z.string().nullable(),
  body: z.string(),
  status: z.enum(["visible", "hidden", "removed"]),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CommentRow = z.output<typeof commentRowSchema>;

/** The caller-bound operations the handler needs (all run as the caller, under RLS). */
export interface PublishCaller {
  userId: string;
  /** Spends one unit of the daily text-review allowance; false once it is used up. */
  takeReviewQuota(): Promise<boolean>;
  mediaExists(path: string): Promise<boolean>;
  publishPost(input: PostInput): Promise<PostRow>;
  addComment(input: CommentInput): Promise<CommentRow>;
}

/** The review of one post or comment, as the database checks it. */
export interface ReviewRecord {
  userId: string;
  target: "post" | "comment";
  title: string | null;
  body: string;
  verdict: "allow" | "hold";
  /** The policy category or the reason no review happened; null for an allow. */
  category: string | null;
}

export interface PublishDeps {
  env: EnvReader;
  caller(req: Request): Promise<PublishCaller>;
  /** null when the review model is not configured. */
  anthropic(): AnthropicClient | null;
  /** Records a review verdict with the service role (`record_text_review`). */
  recordReview(record: ReviewRecord): Promise<void>;
}

/** Throws unless every path is an upload in the caller's own folder. */
export async function verifyMedia(caller: PublishCaller, paths: readonly string[]): Promise<void> {
  const prefix = `${caller.userId}/`;
  for (const path of paths) {
    const file = path.startsWith(prefix) ? path.slice(prefix.length) : null;
    if (file === null || !MEDIA_FILE.test(file) || file.includes("..")) {
      throw new HttpError("forbidden", "Photos must be uploaded to your own folder.", {
        details: { reason: "media_not_owned", path },
      });
    }
  }
  const exists = await Promise.all(paths.map((path) => caller.mediaExists(path)));
  const missing = paths.filter((_, i) => !exists[i]);
  if (missing.length > 0) {
    throw new HttpError("invalid_request", "A photo has not finished uploading.", {
      details: { reason: "media_not_uploaded", paths: missing },
    });
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "kong", "host.docker.internal"]);

/** True when the function runs against a local Supabase stack (`supabase start`). */
export function isLocalStack(env: EnvReader): boolean {
  const url = readEnv(["SUPABASE_URL"], env);
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * `FAMARA_PUBLISH_AI_REVIEW=off` skips the AI review, but only on a local stack: anywhere else
 * the setting is ignored (with a warning), so it can never switch moderation off in production.
 */
export function reviewSwitchedOff(env: EnvReader): boolean {
  if ((readEnv(["FAMARA_PUBLISH_AI_REVIEW"], env) ?? "on").toLowerCase() !== "off") return false;
  if (isLocalStack(env)) return true;
  console.warn("FAMARA_PUBLISH_AI_REVIEW=off is ignored: it only applies to a local stack");
  return false;
}

async function review(
  deps: PublishDeps,
  caller: PublishCaller,
  text: string,
): Promise<ReviewOutcome> {
  // Local development can skip the AI review; the SQL review terms still apply.
  if (reviewSwitchedOff(deps.env)) return { decision: "allow" };
  const client = deps.anthropic();
  if (!client) return { decision: "hold", reason: "review_unavailable" };
  if (!(await caller.takeReviewQuota())) return { decision: "hold", reason: "review_limit" };
  return await reviewText(client, text, { userId: caller.userId });
}

/**
 * Records the verdict the database will look for. Without a recorded allow the text would be
 * held, so failing to record one is an error the member can retry; a hold that cannot be
 * recorded only loses its category (the text is held either way).
 */
async function recordVerdict(
  deps: PublishDeps,
  record: Omit<ReviewRecord, "verdict" | "category">,
  outcome: ReviewOutcome,
): Promise<void> {
  const verdict = outcome.decision === "allow" ? "allow" : "hold";
  const category = outcome.decision === "hold" ? outcome.reason : null;
  try {
    await deps.recordReview({ ...record, verdict, category });
  } catch (error) {
    console.error("review verdict could not be recorded", {
      verdict,
      error: error instanceof Error ? error.message : String(error),
    });
    if (verdict === "allow") {
      throw new HttpError(
        "upstream_unavailable",
        "Publishing is unavailable right now. Try again.",
      );
    }
  }
}

export function createPublishHandler(deps: PublishDeps): Handler {
  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, PublishInput, { maxBytes: 32 * 1024 });

    if (input.type === "post") {
      await verifyMedia(caller, input.media.map((m) => m.path));
      const outcome = await review(deps, caller, `${input.title}\n\n${input.body}`.trim());
      await recordVerdict(deps, {
        userId: caller.userId,
        target: "post",
        title: input.title,
        body: input.body,
      }, outcome);
      const post = await caller.publishPost(input);
      return json({ post, held: post.status !== "visible" }, { status: 201 });
    }

    const outcome = await review(deps, caller, input.body);
    await recordVerdict(deps, {
      userId: caller.userId,
      target: "comment",
      title: null,
      body: input.body,
    }, outcome);
    const comment = await caller.addComment(input);
    return json({ comment, held: comment.status !== "visible" }, { status: 201 });
  });
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

/** Calls an RPC as the caller and parses the row it returns. */
async function callAsCaller<S extends z.ZodType>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  schema: S,
): Promise<z.output<S>> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw rpcErrorToHttp(error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error("rpc returned an unexpected shape", { fn, issues: formatIssues(parsed.error) });
    throw new HttpError("upstream_error", "The database returned an unexpected response.");
  }
  return parsed.data;
}

export function supabasePublishCaller(userId: string, client: SupabaseClient): PublishCaller {
  return {
    userId,
    async takeReviewQuota() {
      return (await consumeQuota(client, AI_QUOTAS.text_review)).allowed;
    },
    async mediaExists(path) {
      // Listing the caller's folder (readable to its owner under the bucket policy) answers
      // "not there" with an empty list rather than an error.
      const slash = path.indexOf("/");
      const folder = path.slice(0, slash);
      const file = path.slice(slash + 1);
      const { data, error } = await client.storage
        .from(MEDIA_BUCKET)
        .list(folder, { search: file, limit: 100 });
      if (error) {
        console.error("media check failed", error);
        throw new HttpError("upstream_error", "Photos could not be checked. Try again.");
      }
      return (data ?? []).some((object) => object.name === file);
    },
    async publishPost(input) {
      return await callAsCaller(
        client,
        "publish_post",
        {
          p_kind: input.kind,
          p_title: input.title,
          p_body: input.body,
          p_recipe_ref: input.recipe_ref ?? null,
          p_rating: input.rating ?? null,
          p_parent_post_id: input.parent_post_id ?? null,
          p_visibility: input.visibility,
          p_media: input.media.map((m) => ({
            path: m.path,
            width: m.width,
            height: m.height,
            ...(m.blurhash ? { blurhash: m.blurhash } : {}),
          })),
        },
        postRowSchema,
      );
    },
    async addComment(input) {
      return await callAsCaller(
        client,
        "add_comment",
        {
          p_post_id: input.post_id,
          p_body: input.body,
          p_parent_comment_id: input.parent_comment_id ?? null,
        },
        commentRowSchema,
      );
    },
  };
}

/** Writes review verdicts with the service role. */
export async function recordReviewWith(
  service: SupabaseClient,
  record: ReviewRecord,
): Promise<void> {
  await callRpc(service, "record_text_review", {
    p_user_id: record.userId,
    p_target: record.target,
    p_title: record.title,
    p_body: record.body,
    p_verdict: record.verdict,
    p_category: record.category,
    p_ttl_seconds: VERDICT_TTL_SECONDS,
  }, z.unknown());
}

export function defaultPublishDeps(env: EnvReader = denoEnv): PublishDeps {
  return {
    env,
    async caller(req) {
      const ctx = await requireUser(req, { env });
      return supabasePublishCaller(ctx.user.id, ctx.client);
    },
    anthropic: () =>
      readEnv(["ANTHROPIC_API_KEY"], env)
        ? AnthropicClient.fromEnv(env, { timeoutMs: 20_000 })
        : null,
    recordReview: (record) => recordReviewWith(createServiceClient({ env }), record),
  };
}
