/**
 * Turns inbox notifications into push messages. The database sends one job per notification with
 * the recipient's device tokens; each token gets its own message so the push service's tickets map
 * one-to-one back to tokens.
 *
 * Lock-screen copy stays short and never includes moderation reasons: the app shows the details
 * after the person opens it.
 */

import { z } from "zod";
import type { ExpoMessage } from "./expo.ts";

const NOTIFICATION_KINDS = [
  "like",
  "comment",
  "reply",
  "follow",
  "friend_accept",
  "moderation",
  "appeal_decision",
  "badge",
] as const;

export const PushJobSchema = z.object({
  notification_id: z.uuid(),
  recipient_id: z.uuid(),
  kind: z.enum(NOTIFICATION_KINDS),
  actor_id: z.uuid().nullish(),
  actor_name: z.string().nullish(),
  post_id: z.uuid().nullish(),
  comment_id: z.uuid().nullish(),
  post_title: z.string().nullish(),
  comment_excerpt: z.string().nullish(),
  /** Name from `public.badges`, for `badge` entries. */
  badge_name: z.string().max(80).nullish(),
  data: z.record(z.string(), z.unknown()).nullish(),
  unread_count: z.number().int().nonnegative().nullish(),
  tokens: z.array(z.string().min(1).max(256)).max(50),
});

export type PushJob = z.infer<typeof PushJobSchema>;

/** Most jobs in one dispatch request; `private.push_dispatch` sends larger statements in parts. */
export const DISPATCH_MAX_JOBS = 500;

export const DispatchBodySchema = z.object({
  messages: z.array(PushJobSchema).max(DISPATCH_MAX_JOBS),
});

export interface PushCopy {
  title: string;
  body: string;
}

/** Collapses whitespace and cuts to `max` characters, ending with an ellipsis when cut. */
export function clip(text: string | null | undefined, max: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function stringField(data: PushJob["data"], key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

function contentNoun(targetKind: string | null): string {
  switch (targetKind) {
    case "comment":
      return "comment";
    case "recipe":
      return "recipe";
    case "user":
      return "profile";
    default:
      return "post";
  }
}

function moderationCopy(job: PushJob): PushCopy {
  const action = stringField(job.data, "action");
  const noun = contentNoun(stringField(job.data, "target_kind"));
  switch (action) {
    case "hide":
      return {
        title: `Your ${noun} is hidden for now`,
        body: "Tap to see why and how to ask for another look.",
      };
    case "remove":
      return {
        title: `Your ${noun} was taken down`,
        body: "Tap to see why and how to ask for another look.",
      };
    case "restore":
      return { title: `Your ${noun} is back`, body: "It is visible to the community again." };
    case "warn":
      return {
        title: "A note about community guidelines",
        body: "Tap to read what happened.",
      };
    case "suspend":
      return {
        title: "Posting is paused on your account",
        body: "Tap to see why and for how long.",
      };
    case "unsuspend":
      return { title: "You can post again", body: "Your account is back to normal." };
    default:
      return { title: "An update about your account", body: "Tap to read it in Famara." };
  }
}

/** Title and body for one notification. */
export function copyFor(job: PushJob): PushCopy {
  const actor = clip(job.actor_name, 40) || "Someone";
  const title = clip(job.post_title, 60);
  const quoted = title ? `“${title}”` : "your post";
  const excerpt = clip(job.comment_excerpt, 120);

  switch (job.kind) {
    case "like":
      return { title: "New like", body: `${actor} liked ${quoted}.` };
    case "comment":
      return {
        title: `${actor} commented on ${quoted}`,
        body: excerpt || "Tap to read it.",
      };
    case "reply":
      return { title: `${actor} replied to your comment`, body: excerpt || "Tap to read it." };
    case "follow":
      return { title: "New follower", body: `${actor} started following you.` };
    case "friend_accept":
      return { title: "New friend", body: `${actor} accepted your invite. You're now friends.` };
    case "moderation":
      return moderationCopy(job);
    case "appeal_decision": {
      const reversed = stringField(job.data, "outcome") === "reversed";
      return reversed
        ? { title: "Your appeal was accepted", body: "We reversed the earlier decision." }
        : { title: "Your appeal was reviewed", body: "Tap to read the outcome." };
    }
    case "badge": {
      const badge = job.badge_name?.trim();
      return {
        title: "New badge earned",
        body: badge ? `${badge}. Nicely done!` : "Tap to see what you unlocked.",
      };
    }
  }
}

/** Groups related pushes in Notification Center: one thread per post, otherwise per kind. */
function threadFor(job: PushJob): string {
  if (job.kind === "moderation" || job.kind === "appeal_decision") return "account";
  if (job.post_id) return `post-${job.post_id}`;
  return job.kind;
}

/** Fields the app needs to route a tapped push; ids only, never message text. */
function routingData(job: PushJob): ExpoMessage["data"] {
  return {
    notification_id: job.notification_id,
    recipient_id: job.recipient_id,
    kind: job.kind,
    actor_id: job.actor_id ?? null,
    post_id: job.post_id ?? null,
    comment_id: job.comment_id ?? null,
    action_id: stringField(job.data, "action_id"),
  };
}

/** One message per device token, deduplicated across jobs for the same notification. */
export function buildMessages(jobs: readonly PushJob[]): ExpoMessage[] {
  const messages: ExpoMessage[] = [];
  for (const job of jobs) {
    const copy = copyFor(job);
    const data = routingData(job);
    const seen = new Set<string>();
    for (const token of job.tokens) {
      if (seen.has(token)) continue;
      seen.add(token);
      const message: ExpoMessage = {
        to: token,
        title: copy.title,
        body: copy.body,
        data,
        sound: "default",
        threadId: threadFor(job),
        channelId: job.kind === "moderation" || job.kind === "appeal_decision"
          ? "account"
          : "social",
        priority: "high",
      };
      if (job.unread_count != null) message.badge = job.unread_count;
      messages.push(message);
    }
  }
  return messages;
}
