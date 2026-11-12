import { assertEquals, assertThrows } from "@std/assert";
import { backoffMs, chunk, EXPO_PUSH_URL, type ExpoMessage, ExpoPushClient } from "./expo.ts";

function message(index: number): ExpoMessage {
  return {
    to: `ExponentPushToken[device${String(index).padStart(4, "0")}]`,
    title: "t",
    body: "b",
    data: {},
  };
}

function okTickets(count: number) {
  return { data: Array.from({ length: count }, (_, i) => ({ status: "ok", id: `ticket-${i}` })) };
}

interface Call {
  url: string;
  batch: ExpoMessage[];
  headers: Headers;
}

/** A fetch stand-in that records each request and answers from `respond`. */
function recordingFetch(respond: (call: Call, index: number) => Response) {
  const calls: Call[] = [];
  const fake = ((input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      batch: JSON.parse(String(init?.body)) as ExpoMessage[],
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    return Promise.resolve(respond(call, calls.length - 1));
  }) as typeof fetch;
  return { fake, calls };
}

const noSleep = () => Promise.resolve();

Deno.test("chunk splits into ordered groups of at most the given size", () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunk([], 100), []);
  assertThrows(() => chunk([1], 0), RangeError);
});

Deno.test("backoff honours Retry-After and caps the exponential wait", () => {
  assertEquals(backoffMs(0, "2"), 2000);
  assertEquals(backoffMs(0, "600"), 10_000);
  assertEquals(backoffMs(0, null), 500);
  assertEquals(backoffMs(1, null), 1000);
  assertEquals(backoffMs(10, null), 4000);
});

Deno.test("sends 250 messages as batches of 100, 100 and 50", async () => {
  const { fake, calls } = recordingFetch((call) => Response.json(okTickets(call.batch.length)));
  const client = new ExpoPushClient({ fetch: fake, sleep: noSleep });
  const report = await client.send(Array.from({ length: 250 }, (_, i) => message(i)));

  assertEquals(calls.map((c) => c.batch.length), [100, 100, 50]);
  assertEquals(calls[0]?.url, EXPO_PUSH_URL);
  assertEquals(calls[2]?.batch[0]?.to, message(200).to);
  assertEquals(report, { accepted: 250, failed: 0, invalidTokens: [], errors: [] });
});

Deno.test("sends the access token only when one is configured", async () => {
  const { fake, calls } = recordingFetch((call) => Response.json(okTickets(call.batch.length)));
  await new ExpoPushClient({ fetch: fake, sleep: noSleep }).send([message(1)]);
  await new ExpoPushClient({ fetch: fake, sleep: noSleep, accessToken: "secret" }).send([
    message(2),
  ]);
  assertEquals(calls[0]?.headers.get("authorization"), null);
  assertEquals(calls[1]?.headers.get("authorization"), "Bearer secret");
});

Deno.test("collects DeviceNotRegistered tokens for cleanup and counts other errors", async () => {
  const { fake } = recordingFetch(() =>
    Response.json({
      data: [
        { status: "ok", id: "a" },
        {
          status: "error",
          message: "not registered",
          details: { error: "DeviceNotRegistered", expoPushToken: message(1).to },
        },
        { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "too big", details: { error: "MessageTooBig" } },
      ],
    })
  );
  const report = await new ExpoPushClient({ fetch: fake, sleep: noSleep }).send([
    message(0),
    message(1),
    message(2),
    message(3),
  ]);
  assertEquals(report.accepted, 1);
  assertEquals(report.failed, 3);
  // The token is taken from the ticket when present, otherwise from the message at that index.
  assertEquals(report.invalidTokens, [message(1).to, message(2).to]);
  assertEquals(report.errors, ["DeviceNotRegistered", "DeviceNotRegistered", "MessageTooBig"]);
});

Deno.test("deduplicates invalid tokens reported in different batches", async () => {
  const dead = message(7).to;
  const { fake } = recordingFetch((call) =>
    Response.json({
      data: call.batch.map((m) =>
        m.to === dead
          ? { status: "error", details: { error: "DeviceNotRegistered" } }
          : { status: "ok", id: "x" }
      ),
    })
  );
  const messages = [...Array.from({ length: 100 }, (_, i) => message(i)), message(7)];
  const report = await new ExpoPushClient({ fetch: fake, sleep: noSleep }).send(messages);
  assertEquals(report.invalidTokens, [dead]);
  assertEquals(report.failed, 2);
});

Deno.test("retries throttling and server errors, then succeeds", async () => {
  const waits: number[] = [];
  const { fake, calls } = recordingFetch((call, index) => {
    if (index === 0) {
      return new Response("slow down", { status: 429, headers: { "retry-after": "1" } });
    }
    if (index === 1) return new Response("oops", { status: 503 });
    return Response.json(okTickets(call.batch.length));
  });
  const client = new ExpoPushClient({
    fetch: fake,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  const report = await client.send([message(1)]);
  assertEquals(calls.length, 3);
  assertEquals(waits, [1000, 1000]);
  assertEquals(report.accepted, 1);
});

Deno.test("gives up after the last attempt and reports the batch as failed", async () => {
  const { fake, calls } = recordingFetch(() => new Response("down", { status: 502 }));
  const report = await new ExpoPushClient({ fetch: fake, sleep: noSleep, maxAttempts: 2 }).send([
    message(1),
    message(2),
  ]);
  assertEquals(calls.length, 2);
  assertEquals(report, { accepted: 0, failed: 2, invalidTokens: [], errors: ["http_502"] });
});

Deno.test("does not retry a rejected request", async () => {
  const { fake, calls } = recordingFetch(() => new Response("bad", { status: 400 }));
  const report = await new ExpoPushClient({ fetch: fake, sleep: noSleep }).send([message(1)]);
  assertEquals(calls.length, 1);
  assertEquals(report.errors, ["http_400"]);
});

Deno.test("treats a ticket list of the wrong length as a failed batch", async () => {
  const { fake } = recordingFetch(() => Response.json(okTickets(1)));
  const report = await new ExpoPushClient({ fetch: fake, sleep: noSleep }).send([
    message(1),
    message(2),
  ]);
  assertEquals(report, {
    accepted: 0,
    failed: 2,
    invalidTokens: [],
    errors: ["unexpected_response"],
  });
});

Deno.test("retries network failures", async () => {
  let attempts = 0;
  const fake = ((_input: string | URL | Request, init?: RequestInit) => {
    attempts += 1;
    if (attempts === 1) return Promise.reject(new TypeError("connection reset"));
    const batch = JSON.parse(String(init?.body)) as ExpoMessage[];
    return Promise.resolve(Response.json(okTickets(batch.length)));
  }) as typeof fetch;
  const report = await new ExpoPushClient({ fetch: fake, sleep: noSleep }).send([message(1)]);
  assertEquals(attempts, 2);
  assertEquals(report.accepted, 1);
});
