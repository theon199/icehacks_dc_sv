import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { cachePath } from '../paths.ts';
import { fileExists, HttpError, politeFetch, writeAtomic } from '../net/http.ts';
import type { SourceTutorial } from '../types.ts';

const STATUS_FILE = cachePath('links', 'status.json');

const linkStatusSchema = z.object({
  /** HTTP status, or 0 for a network-level failure. */
  status: z.number().int(),
  dead: z.boolean(),
  title: z.string().nullable(),
  checkedAt: z.string(),
});
export type LinkStatus = z.infer<typeof linkStatusSchema>;
const statusFileSchema = z.record(z.string(), linkStatusSchema);

export async function readLinkStatuses(): Promise<Map<string, LinkStatus>> {
  if (!(await fileExists(STATUS_FILE))) return new Map();
  const parsed = statusFileSchema.parse(JSON.parse(await readFile(STATUS_FILE, 'utf8')));
  return new Map(Object.entries(parsed));
}

async function saveStatuses(statuses: Map<string, LinkStatus>): Promise<void> {
  const sorted = Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a.localeCompare(b)));
  await writeAtomic(STATUS_FILE, `${JSON.stringify(sorted, null, 1)}\n`);
}

const oembedSchema = z.object({ title: z.string().optional() }).catchall(z.unknown());

/** A video is dead when YouTube's oEmbed endpoint reports it missing (400/404). */
async function checkVideo(url: string): Promise<Omit<LinkStatus, 'checkedAt'>> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  try {
    const response = await politeFetch(endpoint, { attempts: 2, timeoutMs: 20_000, acceptStatuses: [400, 401, 403, 404] });
    if (response.status === 400 || response.status === 404) return { status: response.status, dead: true, title: null };
    if (!response.ok) return { status: response.status, dead: false, title: null };
    const body = oembedSchema.safeParse(await response.json());
    return { status: response.status, dead: false, title: body.success ? (body.data.title ?? null) : null };
  } catch (error) {
    return { status: error instanceof HttpError ? error.status : 0, dead: false, title: null };
  }
}

/**
 * A web page is dead only on a definitive answer: 404/410, or a host that no longer resolves.
 * Bot-blocking (401/403/429) and server errors keep the link, since a person can still open it.
 */
async function checkWeb(url: string): Promise<Omit<LinkStatus, 'checkedAt'>> {
  const accept = [400, 401, 403, 404, 405, 406, 410, 429, 451, 500, 501, 502, 503];
  try {
    let response = await politeFetch(url, { method: 'HEAD', attempts: 1, timeoutMs: 20_000, acceptStatuses: accept });
    if (response.status === 405 || response.status === 501 || response.status === 403) {
      response = await politeFetch(url, { attempts: 1, timeoutMs: 20_000, acceptStatuses: accept });
      await response.body?.cancel();
    }
    return { status: response.status, dead: response.status === 404 || response.status === 410, title: null };
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code ?? '';
    const unresolvable = code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ERR_INVALID_URL';
    return { status: error instanceof HttpError ? error.status : 0, dead: unresolvable && code !== 'EAI_AGAIN', title: null };
  }
}

/** The https form of a plain-http web address, or null when it already is https (or not http). */
export function httpsVariant(url: string): string | null {
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : null;
}

/**
 * Upgrades a plain-http address to https when the https form was checked and answered with a
 * success or redirect status. Hosts that never answered over https keep their original address.
 */
export function preferHttps(url: string, statuses: ReadonlyMap<string, LinkStatus>): string {
  const secure = httpsVariant(url);
  if (!secure) return url;
  const status = statuses.get(secure);
  return status && !status.dead && status.status >= 200 && status.status < 400 ? secure : url;
}

/** HEAD/oEmbed-checks every tutorial URL once (resumable; results cached). */
export async function checkTutorialLinks(tutorials: SourceTutorial[], log: (message: string) => void): Promise<void> {
  const statuses = await readLinkStatuses();
  const unique = [...new Map(tutorials.map((t) => [t.url, t])).values()].filter((t) => !t.url.startsWith('https://medlineplus.gov/'));
  // Plain-http pages are also tried over https so the catalog can link to the secure address.
  const upgrades = unique.flatMap((t) => {
    const secure = t.kind === 'web' ? httpsVariant(t.url) : null;
    return secure ? [{ ...t, url: secure }] : [];
  });
  const pending = [...new Map([...unique, ...upgrades].map((t) => [t.url, t])).values()]
    .filter((t) => !statuses.has(t.url))
    .sort((a, b) => a.url.localeCompare(b.url));
  log(`Links: ${pending.length} to check (${statuses.size} cached)`);
  let done = 0;
  for (const tutorial of pending) {
    const result = tutorial.kind === 'video' ? await checkVideo(tutorial.url) : await checkWeb(tutorial.url);
    statuses.set(tutorial.url, { ...result, checkedAt: new Date().toISOString() });
    done++;
    if (done % 25 === 0) {
      await saveStatuses(statuses);
      log(`Links: checked ${done}/${pending.length}`);
    }
  }
  await saveStatuses(statuses);
  const dead = [...statuses.values()].filter((s) => s.dead).length;
  log(`Links: ${statuses.size} checked in total, ${dead} dead`);
}
