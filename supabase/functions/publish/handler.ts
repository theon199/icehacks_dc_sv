/**
 * `publish`: create a community post or comment after an AI text review.
 *
 * POST { type: "post", kind, title, body?, recipe_ref?, rating?, parent_post_id?, visibility?,
 *        media?: [{ path, width, height, blurhash? }] }
 * POST { type: "comment", post_id, body, parent_comment_id? }
 *
 * Steps: validate the input; check that every photo is an upload in the caller's own
 * `post-media/<uid>/` folder; review the text (moderation.ts); then call `publish_post` /
 * `add_comment` as the caller, so the author is always the caller and the RPCs' own checks apply
 * (age gate, suspension, visibility, rate limits, review terms). Text the review did not allow is
 * sent with the `x-famara-review-hold` header and stored hidden pending a moderator, with an
 * automated report the author can appeal. Returns the created row and whether it was held.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AnthropicClient } from "../_shared/anthropic.ts";
import { requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, consumeQuota } from "../_shared/quota.ts";
import { rpcErrorToHttp } from "../_shared/rpc.ts";
import { formatIssues, parseBody } from "../_shared/validate.ts";
import { type ReviewOutcome, reviewText } from "./moderation.ts";

export const HOLD_HEADER = "x-famara-review-hold";
export const MEDIA_BUCKET = "post-media";

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
  publishPost(input: PostInput, hold: string | null): Promise<PostRow>;
  addComment(input: CommentInput, hold: string | null): Promise<CommentRow>;
}

export interface PublishDeps {
  env: EnvReader;
  caller(req: Request): Promise<PublishCaller>;
  /** null when the review model is not configured. */
  anthropic(): AnthropicClient | null;
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

async function review(
  deps: PublishDeps,
  caller: PublishCaller,
  text: string,
): Promise<ReviewOutcome> {
  // An operator can turn the AI review off (e.g. local development); the SQL review terms and
  // member reports still apply.
  if ((readEnv(["FAMARA_PUBLISH_AI_REVIEW"], deps.env) ?? "on").toLowerCase() === "off") {
    return { decision: "allow" };
  }
  const client = deps.anthropic();
  if (!client) return { decision: "hold", reason: "review_unavailable" };
  if (!(await caller.takeReviewQuota())) return { decision: "hold", reason: "review_limit" };
  return await reviewText(client, text, { userId: caller.userId });
}

export function createPublishHandler(deps: PublishDeps): Handler {
  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, PublishInput, { maxBytes: 32 * 1024 });

    if (input.type === "post") {
      await verifyMedia(caller, input.media.map((m) => m.path));
      const outcome = await review(deps, caller, `${input.title}\n\n${input.body}`.trim());
      const hold = outcome.decision === "hold" ? outcome.reason : null;
      const post = await caller.publishPost(input, hold);
      return json({ post, held: post.status !== "visible" }, { status: 201 });
    }

    const outcome = await review(deps, caller, input.body);
    const hold = outcome.decision === "hold" ? outcome.reason : null;
    const comment = await caller.addComment(input, hold);
    return json({ comment, held: comment.status !== "visible" }, { status: 201 });
  });
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

/** Calls an RPC as the caller, optionally with the review-hold header. */
async function callWithHold<S extends z.ZodType>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  schema: S,
  hold: string | null,
): Promise<z.output<S>> {
  let builder = client.rpc(fn, args);
  if (hold) builder = builder.setHeader(HOLD_HEADER, hold);
  const { data, error } = await builder;
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
      try {
        const { data } = await client.storage.from(MEDIA_BUCKET).exists(path);
        return data;
      } catch (error) {
        console.error("media check failed", error);
        throw new HttpError("upstream_error", "Photos could not be checked. Try again.");
      }
    },
    async publishPost(input, hold) {
      return await callWithHold(
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
        hold,
      );
    },
    async addComment(input, hold) {
      return await callWithHold(
        client,
        "add_comment",
        {
          p_post_id: input.post_id,
          p_body: input.body,
          p_parent_comment_id: input.parent_comment_id ?? null,
        },
        commentRowSchema,
        hold,
      );
    },
  };
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
  };
}
