import { assert, assertEquals } from "@std/assert";
import { checkTarget, fetchPage, isBlockedAddress, parseIpv6, type Resolver } from "./ssrf.ts";

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V6 = "2606:2800:220:1:248:1893:25c8:1946";

/** A resolver from a fixed table; names not in it have no records. */
function resolver(table: Record<string, { A?: string[]; AAAA?: string[] }>): Resolver {
  return (host, type) => Promise.resolve(table[host]?.[type] ?? []);
}

const PUBLIC_DNS = resolver({
  "recipes.example.com": { A: [PUBLIC_V4], AAAA: [PUBLIC_V6] },
  "cdn.example.com": { A: [PUBLIC_V4] },
  "internal.example.com": { A: ["10.0.0.7"] },
  "mixed.example.com": { A: [PUBLIC_V4], AAAA: ["fd00:ec2::254"] },
  "metadata.example.com": { A: ["169.254.169.254"] },
});

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    return route ? Promise.resolve(route()) : Promise.reject(new TypeError(`no route ${url}`));
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

Deno.test("blocks private, loopback, link-local, CGNAT, metadata and special IPv4", () => {
  for (
    const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "100.100.100.200",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.2.10",
      "192.168.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]
  ) {
    assert(isBlockedAddress(address), address);
  }
  for (const address of [PUBLIC_V4, "8.8.8.8", "172.32.0.1", "100.128.0.1"]) {
    assert(!isBlockedAddress(address), address);
  }
});

Deno.test("blocks loopback, unique-local, link-local, multicast and embedded private IPv6", () => {
  for (
    const address of [
      "::",
      "::1",
      "[::1]",
      "fc00::1",
      "fd00:ec2::254",
      "fe80::1",
      "fec0::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:169.254.169.254",
      "64:ff9b::10.0.0.1",
      "64:ff9b:1::1",
      "2002:0a00:0001::1",
      "2001:db8::1",
      "2001:0:4136:e378::1",
      "100::1",
      "fe80::1%en0",
      "not-an-address",
    ]
  ) {
    assert(isBlockedAddress(address), address);
  }
  for (const address of [PUBLIC_V6, "::ffff:93.184.216.34", "2a00:1450:4009:81f::200e"]) {
    assert(!isBlockedAddress(address), address);
  }
});

Deno.test("parses IPv6 with compression and embedded IPv4", () => {
  assertEquals(parseIpv6("::ffff:1.2.3.4")?.slice(10), [0xff, 0xff, 1, 2, 3, 4]);
  assertEquals(parseIpv6("1::2:3:4:5:6:7:8"), null);
  assertEquals(parseIpv6("1:2:3:4:5:6:7:8:9"), null);
  assertEquals(parseIpv6("::")?.length, 16);
});

Deno.test("checkTarget allows public hosts on the standard ports only", async () => {
  const ok = (url: string) => checkTarget(new URL(url), PUBLIC_DNS);
  assertEquals(await ok("https://recipes.example.com/adobo"), { ok: true });
  assertEquals(await ok("http://recipes.example.com:80/adobo"), { ok: true });
  for (
    const url of [
      "ftp://recipes.example.com/adobo",
      "file:///etc/passwd",
      "https://recipes.example.com:8443/adobo",
      "http://recipes.example.com:22/",
      "https://user:pass@recipes.example.com/",
      "http://localhost/",
      "http://printer.local/",
      "http://intranet/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f.0.0.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://internal.example.com/",
      "http://mixed.example.com/",
      "http://metadata.example.com/",
    ]
  ) {
    assertEquals(await ok(url), { ok: false, reason: "blocked" }, url);
  }
  assertEquals(await ok("https://nowhere.example.com/"), { ok: false, reason: "unresolvable" });
});

Deno.test("fetchPage reads a public HTML page without following redirects automatically", async () => {
  const { fetch, calls } = fakeFetch({
    "https://recipes.example.com/adobo": () => html("<h1>Adobo</h1>"),
  });
  const page = await fetchPage(new URL("https://recipes.example.com/adobo"), {
    resolve: PUBLIC_DNS,
    fetch,
  });
  assertEquals(page, {
    ok: true,
    url: "https://recipes.example.com/adobo",
    html: "<h1>Adobo</h1>",
    truncated: false,
  });
  assertEquals(calls[0]?.init?.redirect, "manual");
});

Deno.test("fetchPage never fetches a blocked first target", async () => {
  const { fetch, calls } = fakeFetch({});
  const page = await fetchPage(new URL("http://10.0.0.1/"), { resolve: PUBLIC_DNS, fetch });
  assertEquals(page, { ok: false, reason: "blocked" });
  assertEquals(calls.length, 0);
});

Deno.test("fetchPage re-checks every redirect and refuses one to a private address", async () => {
  for (
    const location of [
      "http://169.254.169.254/latest/meta-data/",
      "http://internal.example.com/admin",
      "http://[::1]:80/",
      "http://localhost/",
      "https://recipes.example.com:8443/",
    ]
  ) {
    const { fetch, calls } = fakeFetch({
      "https://recipes.example.com/adobo": () => redirect(location),
    });
    const page = await fetchPage(new URL("https://recipes.example.com/adobo"), {
      resolve: PUBLIC_DNS,
      fetch,
    });
    assertEquals(page, { ok: false, reason: "blocked" }, location);
    assertEquals(calls.length, 1, location);
  }
});

Deno.test("fetchPage follows up to three public redirects, relative ones included", async () => {
  const { fetch } = fakeFetch({
    "https://recipes.example.com/a": () => redirect("/b", 301),
    "https://recipes.example.com/b": () => redirect("https://cdn.example.com/c", 307),
    "https://cdn.example.com/c": () => redirect("https://cdn.example.com/d", 308),
    "https://cdn.example.com/d": () => html("done"),
  });
  const page = await fetchPage(new URL("https://recipes.example.com/a"), {
    resolve: PUBLIC_DNS,
    fetch,
  });
  assertEquals(page, {
    ok: true,
    url: "https://cdn.example.com/d",
    html: "done",
    truncated: false,
  });
});

Deno.test("fetchPage gives up after the third redirect", async () => {
  const { fetch, calls } = fakeFetch({
    "https://cdn.example.com/1": () => redirect("/2"),
    "https://cdn.example.com/2": () => redirect("/3"),
    "https://cdn.example.com/3": () => redirect("/4"),
    "https://cdn.example.com/4": () => redirect("/5"),
    "https://cdn.example.com/5": () => html("too far"),
  });
  const page = await fetchPage(new URL("https://cdn.example.com/1"), {
    resolve: PUBLIC_DNS,
    fetch,
  });
  assertEquals(page, { ok: false, reason: "unreadable" });
  assertEquals(calls.length, 4);
});

Deno.test("fetchPage accepts only HTML", async () => {
  for (const type of ["application/json", "image/jpeg", "application/pdf", "text/plain"]) {
    const { fetch } = fakeFetch({
      "https://cdn.example.com/x": () =>
        new Response("{}", { status: 200, headers: { "content-type": type } }),
    });
    const page = await fetchPage(new URL("https://cdn.example.com/x"), {
      resolve: PUBLIC_DNS,
      fetch,
    });
    assertEquals(page, { ok: false, reason: "not_html" }, type);
  }
  const { fetch } = fakeFetch({
    "https://cdn.example.com/x": () => new Response("<p>hi</p>", { status: 200 }),
  });
  const untyped = await fetchPage(new URL("https://cdn.example.com/x"), {
    resolve: PUBLIC_DNS,
    fetch,
  });
  assertEquals(untyped, { ok: false, reason: "not_html" });
});

Deno.test("fetchPage reads at most the byte cap", async () => {
  let pulled = 0;
  const chunk = new Uint8Array(1024).fill(0x61);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(chunk);
    },
  });
  const { fetch } = fakeFetch({
    "https://cdn.example.com/big": () =>
      new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
  });
  const page = await fetchPage(new URL("https://cdn.example.com/big"), {
    resolve: PUBLIC_DNS,
    fetch,
    limits: { maxBytes: 4096 + 100 },
  });
  assert(page.ok);
  assertEquals(page.html.length, 4196);
  assertEquals(page.truncated, true);
  assert(pulled <= 7, `read ${pulled} chunks`);
});

Deno.test("fetchPage treats error statuses, network failures and timeouts as unreadable", async () => {
  const notFound = fakeFetch({
    "https://cdn.example.com/x": () => new Response("gone", { status: 404 }),
  });
  assertEquals(
    await fetchPage(new URL("https://cdn.example.com/x"), {
      resolve: PUBLIC_DNS,
      fetch: notFound.fetch,
    }),
    { ok: false, reason: "unreadable" },
  );
  const failing = fakeFetch({});
  assertEquals(
    await fetchPage(new URL("https://cdn.example.com/x"), {
      resolve: PUBLIC_DNS,
      fetch: failing.fetch,
    }),
    { ok: false, reason: "unreadable" },
  );
  const hanging =
    ((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
  assertEquals(
    await fetchPage(new URL("https://cdn.example.com/x"), {
      resolve: PUBLIC_DNS,
      fetch: hanging,
      limits: { timeoutMs: 20 },
    }),
    { ok: false, reason: "unreadable" },
  );
});

/** A resolver whose answer for one host turns private after `publicAnswers` A lookups. */
function rebinding(
  host: string,
  publicAnswers: number,
): { resolve: Resolver; lookups: () => number } {
  let count = 0;
  const resolve: Resolver = (name, type) => {
    if (name !== host) return PUBLIC_DNS(name, type);
    if (type !== "A") return Promise.resolve([]);
    count += 1;
    return Promise.resolve([count <= publicAnswers ? PUBLIC_V4 : "127.0.0.1"]);
  };
  return { resolve, lookups: () => count };
}

Deno.test("fetchPage looks the host up again just before connecting and refuses a rebind", async () => {
  const { fetch, calls } = fakeFetch({ "https://rebind.example.com/": () => html("<h1>x</h1>") });
  const { resolve, lookups } = rebinding("rebind.example.com", 1);
  const page = await fetchPage(new URL("https://rebind.example.com/"), { resolve, fetch });
  assertEquals(page, { ok: false, reason: "blocked" });
  assertEquals(calls.length, 0);
  assertEquals(lookups(), 2);
});

Deno.test("fetchPage refuses a redirect hop whose host rebinds", async () => {
  const { fetch, calls } = fakeFetch({
    "https://recipes.example.com/a": () => redirect("https://rebind.example.com/b"),
    "https://rebind.example.com/b": () => html("<h1>x</h1>"),
  });
  const { resolve } = rebinding("rebind.example.com", 1);
  const page = await fetchPage(new URL("https://recipes.example.com/a"), { resolve, fetch });
  assertEquals(page, { ok: false, reason: "blocked" });
  assertEquals(calls.map((call) => call.url), ["https://recipes.example.com/a"]);
});

Deno.test("fetchPage keeps its deadline when the resolver stalls", async () => {
  const { fetch, calls } = fakeFetch({});
  const stalled: Resolver = (_host, _type, signal) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<"hung">((resolve) => {
    timer = setTimeout(() => resolve("hung"), 2_000);
  });
  const result = await Promise.race([
    fetchPage(new URL("https://slow.example.com/"), {
      resolve: stalled,
      fetch,
      limits: { timeoutMs: 50 },
    }),
    hung,
  ]);
  clearTimeout(timer);
  assertEquals(result, { ok: false, reason: "unreadable" });
  assertEquals(calls.length, 0);
});

Deno.test("fetchPage keeps its deadline even when a resolver ignores the abort signal", async () => {
  const { fetch } = fakeFetch({});
  const deaf: Resolver = () => new Promise(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<"hung">((resolve) => {
    timer = setTimeout(() => resolve("hung"), 2_000);
  });
  const result = await Promise.race([
    fetchPage(new URL("https://slow.example.com/"), {
      resolve: deaf,
      fetch,
      limits: { timeoutMs: 50 },
    }),
    hung,
  ]);
  clearTimeout(timer);
  assertEquals(result, { ok: false, reason: "unreadable" });
});
