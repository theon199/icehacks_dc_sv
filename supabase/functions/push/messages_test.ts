import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildMessages, clip, copyFor, type PushJob } from "./messages.ts";

const RECIPIENT = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const POST = "33333333-3333-4333-8333-333333333333";

function job(overrides: Partial<PushJob> = {}): PushJob {
  return {
    notification_id: "44444444-4444-4444-8444-444444444444",
    recipient_id: RECIPIENT,
    kind: "like",
    actor_id: ACTOR,
    actor_name: "Ana",
    post_id: POST,
    comment_id: null,
    post_title: "Lighter jollof",
    comment_excerpt: null,
    data: {},
    unread_count: 3,
    tokens: ["ExponentPushToken[aaaaaaaaaa]"],
    ...overrides,
  };
}

Deno.test("clip flattens whitespace and adds an ellipsis only when cutting", () => {
  assertEquals(clip("  a \n b  ", 10), "a b");
  assertEquals(clip("abcdefghij", 5), "abcd…");
  assertEquals(clip(null, 5), "");
});

Deno.test("social copy names the actor and the post", () => {
  assertEquals(copyFor(job()), { title: "New like", body: "Ana liked “Lighter jollof”." });
  const comment = copyFor(job({ kind: "comment", comment_excerpt: "Looks great!" }));
  assertEquals(comment.title, "Ana commented on “Lighter jollof”");
  assertEquals(comment.body, "Looks great!");
  assertEquals(copyFor(job({ kind: "follow" })).body, "Ana started following you.");
});

Deno.test("missing actor names fall back to a neutral word", () => {
  assertStringIncludes(copyFor(job({ kind: "follow", actor_name: null })).body, "Someone");
});

Deno.test("moderation copy never includes the reason", () => {
  const copy = copyFor(
    job({
      kind: "moderation",
      actor_id: null,
      data: { action: "hide", target_kind: "comment", reason: "Personal attack on another member" },
    }),
  );
  assertEquals(copy.title, "Your comment is hidden for now");
  assertEquals(copy.body.includes("attack"), false);
});

Deno.test("appeal outcomes have distinct copy", () => {
  const reversed = copyFor(job({ kind: "appeal_decision", data: { outcome: "reversed" } }));
  const upheld = copyFor(job({ kind: "appeal_decision", data: { outcome: "upheld" } }));
  assertEquals(reversed.title, "Your appeal was accepted");
  assertEquals(upheld.title, "Your appeal was reviewed");
});

Deno.test("buildMessages emits one message per distinct token with routing ids only", () => {
  const messages = buildMessages([
    job({
      tokens: [
        "ExponentPushToken[aaaaaaaaaa]",
        "ExponentPushToken[bbbbbbbbbb]",
        "ExponentPushToken[aaaaaaaaaa]",
      ],
    }),
    job({ kind: "moderation", data: { action: "warn", action_id: "act-1" }, tokens: [] }),
  ]);
  assertEquals(messages.map((m) => m.to), [
    "ExponentPushToken[aaaaaaaaaa]",
    "ExponentPushToken[bbbbbbbbbb]",
  ]);
  const first = messages[0];
  assertEquals(first?.badge, 3);
  assertEquals(first?.threadId, `post-${POST}`);
  assertEquals(first?.data, {
    notification_id: "44444444-4444-4444-8444-444444444444",
    recipient_id: RECIPIENT,
    kind: "like",
    actor_id: ACTOR,
    post_id: POST,
    comment_id: null,
    action_id: null,
  });
});

Deno.test("moderation pushes carry the decision id and use the account channel", () => {
  const [message] = buildMessages([
    job({ kind: "moderation", actor_id: null, data: { action: "suspend", action_id: "act-9" } }),
  ]);
  assertEquals(message?.data.action_id, "act-9");
  assertEquals(message?.channelId, "account");
  assertEquals(message?.threadId, "account");
});
