/**
 * Fetching a recipe page someone pasted, without letting the link reach anything but the public
 * web (server-side request forgery).
 *
 * - Only http and https on ports 80 and 443, with no credentials in the URL.
 * - The host is resolved first; every address it resolves to (IPv4 and IPv6) must be public
 *   unicast. Private, loopback, link-local, CGNAT, metadata, multicast, documentation and other
 *   special ranges are refused, including IPv4 addresses embedded in IPv6 (mapped, NAT64, 6to4).
 * - Redirects are followed by hand, at most three, and every hop is checked again.
 * - Right before each connection the host is looked up a second time, and every address in that
 *   answer must be public too, so a name that flips to a private address between the two lookups
 *   (DNS rebinding) is refused.
 * - One 10 s deadline covers every lookup, every hop and the body; at most 2 MB of the body is
 *   read, and only HTML is accepted.
 *
 * Residual risk: the platform's `fetch` cannot be pinned to an address (Deno has no resolver or
 * TLS server-name override for it), so it resolves the host a third time when it connects. A
 * rebinding server that answers public twice and private on the third lookup is not caught here.
 * See "Recipe import: SSRF" in docs/BACKEND.md.
 */

export const PAGE_LIMITS = {
  maxRedirects: 3,
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
} as const;

const ALLOWED_PORTS = new Set(["", "80", "443"]);
const HTML_TYPES = ["text/html", "application/xhtml+xml"];
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet"];

export type Resolver = (
  host: string,
  type: "A" | "AAAA",
  signal?: AbortSignal,
) => Promise<string[]>;

/** The platform resolver; a name with no records of a type resolves to none. */
export const denoResolver: Resolver = async (host, type, signal) => {
  try {
    return await Deno.resolveDns(host, type, signal ? { signal } : undefined);
  } catch {
    if (signal?.aborted) throw signal.reason;
    return [];
  }
};

/** Settles with `work`, or rejects once `signal` aborts, whether or not `work` listens to it. */
function withinDeadline<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Every address a name resolves to, IPv4 and IPv6, within the deadline. */
function lookup(host: string, resolve: Resolver, signal?: AbortSignal): Promise<string[]> {
  return withinDeadline(
    Promise.all([resolve(host, "A", signal), resolve(host, "AAAA", signal)]).then((
      [v4, v6],
    ) => [...v4, ...v6]),
    signal,
  );
}

// ---------------------------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------------------------

/** Four bytes for a dotted-quad IPv4 address, or null. */
export function parseIpv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

/** Sixteen bytes for an IPv6 address (brackets allowed, zone ids refused), or null. */
export function parseIpv6(text: string): number[] | null {
  let value = text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
  if (value.includes("%") || !value.includes(":")) return null;
  let tail: number[] = [];
  const lastColon = value.lastIndexOf(":");
  const last = value.slice(lastColon + 1);
  if (last.includes(".")) {
    const v4 = parseIpv4(last);
    if (!v4) return null;
    tail = v4;
    value = `${value.slice(0, lastColon + 1)}0:0`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = groups(halves[0] ?? "");
  const rest = halves.length === 2 ? groups(halves[1] ?? "") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const bytes: number[] = [];
  for (const group of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const word = parseInt(group, 16);
    bytes.push(word >> 8, word & 0xff);
  }
  if (tail.length === 4) bytes.splice(12, 4, ...tail);
  return bytes;
}

type Cidr = readonly [bytes: readonly number[], prefix: number];

function inCidr(address: readonly number[], [network, prefix]: Cidr): boolean {
  for (let bit = 0; bit < prefix; bit++) {
    const byte = bit >> 3;
    const mask = 0x80 >> (bit & 7);
    if (((address[byte] ?? 0) & mask) !== ((network[byte] ?? 0) & mask)) return false;
  }
  return true;
}

/** Every IPv4 range that is not public unicast. */
const BLOCKED_V4: readonly Cidr[] = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // carrier-grade NAT (also Alibaba's metadata address)
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, cloud metadata (169.254.169.254)
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // documentation
  [[192, 31, 196, 0], 24], // AS112
  [[192, 52, 193, 0], 24], // AMT
  [[192, 88, 99, 0], 24], // 6to4 relay anycast
  [[192, 168, 0, 0], 16], // private
  [[192, 175, 48, 0], 24], // AS112
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // documentation
  [[203, 0, 113, 0], 24], // documentation
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved and broadcast
];

export function isBlockedIpv4(bytes: readonly number[]): boolean {
  return BLOCKED_V4.some((cidr) => inCidr(bytes, cidr));
}

const V6 = (...words: number[]) => words.flatMap((word) => [word >> 8, word & 0xff]);

/** IPv6 ranges inside global unicast (2000::/3) that are still not public. */
const BLOCKED_V6: readonly Cidr[] = [
  [V6(0x2001, 0), 23], // IETF protocol assignments: Teredo, benchmarking, ORCHID
  [V6(0x2001, 0x0db8), 32], // documentation
  [V6(0x3fff, 0), 20], // documentation
];

/** Where an IPv6 address carries an IPv4 one: mapped, compatible, NAT64 and 6to4. */
function embeddedIpv4(bytes: readonly number[]): number[] | null {
  const zeros = (from: number, to: number) => bytes.slice(from, to).every((byte) => byte === 0);
  if (zeros(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return bytes.slice(12, 16);
  if (zeros(0, 12)) return bytes.slice(12, 16);
  if (inCidr(bytes, [V6(0x64, 0xff9b), 96])) return bytes.slice(12, 16);
  if (inCidr(bytes, [V6(0x2002), 16])) return bytes.slice(2, 6);
  return null;
}

export function isBlockedIpv6(bytes: readonly number[]): boolean {
  const v4 = embeddedIpv4(bytes);
  // ::, ::1 and IPv4-compatible forms land here as 0.0.0.x, which the IPv4 list refuses.
  if (v4) return isBlockedIpv4(v4);
  // NAT64 local-use prefix.
  if (inCidr(bytes, [V6(0x64, 0xff9b, 1), 48])) return true;
  // Only global unicast is public: this refuses unique-local (fc00::/7, including AWS's
  // fd00:ec2::254 metadata address), link-local, site-local, multicast and the rest.
  if (!inCidr(bytes, [V6(0x2000), 3])) return true;
  return BLOCKED_V6.some((cidr) => inCidr(bytes, cidr));
}

/** True for an address literal that may not be fetched; false for public ones. */
export function isBlockedAddress(text: string): boolean {
  const v4 = parseIpv4(text);
  if (v4) return isBlockedIpv4(v4);
  const v6 = parseIpv6(text);
  if (v6) return isBlockedIpv6(v6);
  // Anything that is not a well-formed address cannot be judged, so it is refused.
  return true;
}

// ---------------------------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------------------------

export type TargetCheck = { ok: true } | { ok: false; reason: "blocked" | "unresolvable" };

/** The host name to look up, or null when the URL names an address literal. */
function lookupHost(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host.startsWith("[") || parseIpv4(host) ? null : host;
}

/** Whether `url` may be fetched: scheme, port, credentials, host name and every address. */
export async function checkTarget(
  url: URL,
  resolve: Resolver,
  signal?: AbortSignal,
): Promise<TargetCheck> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "blocked" };
  }
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "blocked" };
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, reason: "blocked" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) {
    return isBlockedAddress(host) ? { ok: false, reason: "blocked" } : { ok: true };
  }
  if (parseIpv4(host)) {
    return isBlockedAddress(host) ? { ok: false, reason: "blocked" } : { ok: true };
  }
  if (
    host === "" || host === "localhost" || !host.includes(".") ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return { ok: false, reason: "blocked" };
  }
  const addresses = await lookup(host, resolve, signal);
  if (addresses.length === 0) return { ok: false, reason: "unresolvable" };
  if (addresses.some(isBlockedAddress)) return { ok: false, reason: "blocked" };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------------------------

export interface PageLimits {
  maxRedirects: number;
  timeoutMs: number;
  maxBytes: number;
}

export interface PageDeps {
  resolve?: Resolver;
  fetch?: typeof fetch;
  limits?: Partial<PageLimits>;
}

export type PageResult =
  | { ok: true; url: string; html: string }
  | { ok: false; reason: "blocked" | "unreadable" | "not_html" };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function isHtml(contentType: string | null): boolean {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return HTML_TYPES.includes(type);
}

function charsetOf(contentType: string | null): string {
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType ?? "");
  return match?.[1] ?? "utf-8";
}

/** Reads at most `maxBytes` of the body and stops the download there. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const step = await reader.read();
      if (step.done) break;
      const room = maxBytes - size;
      const chunk = step.value.byteLength > room ? step.value.subarray(0, room) : step.value;
      chunks.push(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decode(bytes: Uint8Array, contentType: string | null): string {
  try {
    return new TextDecoder(charsetOf(contentType)).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

/** Fetches an HTML page within the limits above, checking the target before every hop. */
export async function fetchPage(start: URL, deps: PageDeps = {}): Promise<PageResult> {
  const resolve = deps.resolve ?? denoResolver;
  const doFetch = deps.fetch ?? fetch;
  const limits: PageLimits = { ...PAGE_LIMITS, ...deps.limits };
  const signal = AbortSignal.timeout(limits.timeoutMs);
  let url = start;
  try {
    for (let hop = 0;; hop++) {
      const target = await checkTarget(url, resolve, signal);
      if (!target.ok) {
        return { ok: false, reason: target.reason === "blocked" ? "blocked" : "unreadable" };
      }
      // Looked up again right before connecting: a name that now answers with anything private
      // (or nothing) is refused rather than trusted from the first answer.
      const host = lookupHost(url);
      if (host !== null) {
        const again = await lookup(host, resolve, signal);
        if (again.length === 0 || again.some(isBlockedAddress)) {
          return { ok: false, reason: "blocked" };
        }
      }
      if (signal.aborted) return { ok: false, reason: "unreadable" };
      const response = await doFetch(url.href, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9",
          "user-agent": "FamaraRecipeImport/1.0",
        },
      });
      if (REDIRECTS.has(response.status)) {
        const location = response.headers.get("location");
        await discard(response);
        if (!location || hop >= limits.maxRedirects) return { ok: false, reason: "unreadable" };
        try {
          url = new URL(location, url);
        } catch {
          return { ok: false, reason: "unreadable" };
        }
        continue;
      }
      if (!response.ok) {
        await discard(response);
        return { ok: false, reason: "unreadable" };
      }
      const contentType = response.headers.get("content-type");
      if (!isHtml(contentType)) {
        await discard(response);
        return { ok: false, reason: "not_html" };
      }
      const bytes = await readCapped(response, limits.maxBytes);
      return { ok: true, url: url.href, html: decode(bytes, contentType) };
    }
  } catch {
    // Timeouts, refused connections and TLS failures all mean the page could not be read.
    return { ok: false, reason: "unreadable" };
  }
}
