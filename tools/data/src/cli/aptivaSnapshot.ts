/** Extract recipe inputs and a rights audit from an unpacked copy of the pinned GitHub revision. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { slugify } from '../derive/recipe.ts';
import { PACKAGE_ROOT } from '../paths.ts';
import type { Course } from '../types.ts';

const REVISION = '03cd1c029e7341303e531f14c82750245884da1c';
const CATALOG_REVISION = 'dfb9db8cc7eb7201544a796b8c397d1a5ad01918259ab57f3546c295ee9f585b';
const SUMMARIES_SHA256 = '96cbe749ffb070a9d001b097c8a4ea938fa9cf70b36640a96001d376c87ec1d4';
const MEDIA_SHA256 = '0b2cb47388a2309a9d6623ff9978df696e673276d98b1f664b7b543af08c0532';
const root = process.argv[2];
if (!root) throw new Error('Provide the extracted Aptiva GitHub archive directory');

interface AptivaSummary {
  id: string;
  name: string;
  cuisines: string[];
  totalMinutes: number | null;
  reviewStatus: string;
  ingredients: { ingredientId: string; originalText: string }[];
  source: { publisher: string };
  adaptation?: { sourceMealId?: string };
  nutrition?: { servingBasis?: string };
}

interface AptivaDetail {
  id: string;
  contextTags: string[];
  steps?: { order: number; instruction: string; provenance: string }[];
  source: { url: string | null; licenseNote: string; accessedAt: string };
}

const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const summariesPath = resolve(root, 'data/runtime/catalogSummaries.generated.ts');
if (checksum(readFileSync(summariesPath)) !== SUMMARIES_SHA256)
  throw new Error('Aptiva summaries hash mismatch');
const data = (await import(pathToFileURL(summariesPath).href)) as {
  CATALOG_REVISION: string;
  CATALOG_MEAL_SUMMARIES: AptivaSummary[];
  CATALOG_INGREDIENT_SAFETY: { id: string; canonicalName: string }[];
};
if (data.CATALOG_REVISION !== CATALOG_REVISION)
  throw new Error('Aptiva summaries are not from the pinned catalog');

const manifest = readFileSync(
  join(root, 'data/runtime/catalogDetailManifest.generated.ts'),
  'utf8',
);
const hashes = [
  ...manifest.matchAll(/catalog-detail-(\d{2})\.aptiva'\).*?sha256:\s*'([a-f0-9]{64})'/gs),
];
if (hashes.length !== 32 || new Set(hashes.map((m) => m[1])).size !== 32)
  throw new Error('Incomplete Aptiva catalog detail manifest');
const details = new Map<string, AptivaDetail>();
for (const [, bucket, sha] of hashes) {
  const bytes = readFileSync(join(root, `assets/catalog/catalog-detail-${bucket}.aptiva`));
  if (checksum(bytes) !== sha) throw new Error(`Aptiva detail hash mismatch for bucket ${bucket}`);
  const detail = JSON.parse(bytes.toString('utf8')) as {
    catalogRevision: string;
    mealDetails: AptivaDetail[];
  };
  if (detail.catalogRevision !== CATALOG_REVISION)
    throw new Error(`Aptiva detail revision mismatch for bucket ${bucket}`);
  for (const record of detail.mealDetails) {
    if (details.has(record.id)) throw new Error(`Duplicate Aptiva detail ID ${record.id}`);
    details.set(record.id, record);
  }
}
const summaries = [...data.CATALOG_MEAL_SUMMARIES].sort((a, b) => a.id.localeCompare(b.id));
if (
  new Set(summaries.map((r) => r.id)).size !== details.size ||
  summaries.length !== details.size
) {
  throw new Error('Aptiva summary and detail ID sets differ');
}
const taxonomy = new Map(
  data.CATALOG_INGREDIENT_SAFETY.map((ingredient) => [ingredient.id, ingredient.canonicalName]),
);

// Each asset belongs to the same shipped dish ID, has passed Aptiva's media screening,
// and comes from its public recipe bucket. Generated artwork is credited as illustration.
const media = readFileSync(join(root, 'data/recipeMedia/remoteRecipeMedia.generated.ts'));
if (checksum(media) !== MEDIA_SHA256) throw new Error('Aptiva media manifest hash mismatch');
const illustrations = new Map<string, string>();
for (const [, id, entry] of media
  .toString('utf8')
  .matchAll(/^  '([^']+)': \{\n([\s\S]*?)^  \},/gm)) {
  if (!id || !entry || !/screening:\s*'passed'/.test(entry)) continue;
  const model = /model:\s*'([^']+)'/.exec(entry)?.[1];
  const url =
    /url:\s*'(https:\/\/ebgevflibwelxrwylkay\.supabase\.co\/storage\/v1\/object\/public\/recipe-media-public\/heroes\/[a-z0-9-]+\.webp)'/.exec(
      entry,
    )?.[1];
  if (
    url &&
    model &&
    [
      'gemini-3.1-flash-lite-image',
      'antigravity-built-in-imagegen',
      'codex-built-in-imagegen',
    ].includes(model)
  ) {
    illustrations.set(id, url);
  }
}

function courseFromTags(tags: string[]): Course | undefined {
  return (['drink', 'dessert', 'soup', 'salad', 'breakfast', 'side', 'snack'] as const).find(
    (course) => tags.includes(course),
  );
}

function rights(summary: AptivaSummary, detail: AptivaDetail): string | null {
  const { licenseNote, url } = detail.source;
  if (
    /^Aptiva (?:original|curated educational)|^Proprietary culinary asset/.test(licenseNote) &&
    detail.steps?.every((s) => ['aptiva_authored', 'ai_authored'].includes(s.provenance))
  ) {
    return 'Recipe formulation from the pre-existing Aptiva catalog';
  }
  if (
    licenseNote.startsWith('Adapted in Aptiva') &&
    detail.steps?.every((s) => s.provenance === 'aptiva_authored')
  ) {
    return 'Aptiva adaptation in its own words';
  }
  if (
    licenseNote.startsWith('TheMealDB terms permit') &&
    summary.source.publisher === 'TheMealDB'
  ) {
    return 'Recipe data provided by TheMealDB, via Aptiva';
  }
  if (
    licenseNote.startsWith('MedlinePlus identifies') &&
    url?.startsWith('https://medlineplus.gov/recipes/')
  ) {
    return 'Courtesy of MedlinePlus from the National Library of Medicine, via Aptiva';
  }
  return null;
}

const excluded: { id: string; reason: string }[] = [];
const candidates = summaries.flatMap((summary) => {
  const detail = details.get(summary.id);
  if (!detail) throw new Error(`Missing Aptiva detail ${summary.id}`);
  const reject = (reason: string) => {
    excluded.push({ id: summary.id, reason });
    return [];
  };
  if (summary.reviewStatus !== 'reviewed')
    return reject(`Aptiva review status: ${summary.reviewStatus}`);
  const steps = [...(detail.steps ?? [])].sort((a, b) => a.order - b.order);
  if (
    summary.ingredients.length === 0 ||
    summary.ingredients.some((i) => !i.originalText.trim()) ||
    steps.length === 0 ||
    steps.some((step, i) => !step.instruction.trim() || step.order !== i + 1)
  ) {
    return reject('Incomplete ingredients or ordered directions');
  }
  const license = rights(summary, detail);
  if (!license) return reject('Recipe directions lack a confirmed reuse basis for this snapshot');
  const sourceUrl =
    detail.source.url?.startsWith('https://') &&
    !new URL(detail.source.url).hostname.endsWith('.internal')
      ? detail.source.url
      : null;
  const imageUrl = illustrations.get(summary.id) ?? null;
  const id = `aptiva:${slugify(summary.id)}`;
  const yieldText = summary.nutrition?.servingBasis ?? '';
  const servings = Number(
    /(?:^|\b)(?:serves|makes|recipe yields)\s+(\d+)\b/i.exec(yieldText)?.[1] ??
      /^\s*(\d+)\s+servings\s*$/i.exec(yieldText)?.[1],
  );
  const mealDB = sourceUrl
    ? /^https:\/\/(?:www\.)?themealdb\.com\/meal\/(\d+)(?:[-/]|$)/i.exec(sourceUrl)?.[1]
    : undefined;
  return [
    {
      id,
      source: 'aptiva',
      sourceId: summary.id,
      title: summary.name.replace(/\s*—\s*Aptivized$/i, ''),
      area: summary.cuisines[0] ?? null,
      course: courseFromTags(detail.contextTags),
      // Keep the original wording for safety. Taxonomy labels can omit a choice or qualifier.
      lines: summary.ingredients.map((ingredient) => ({ text: ingredient.originalText.trim() })),
      instructions: steps.map((step) => step.instruction.trim()),
      servings: Number.isInteger(servings) && servings > 0 && servings <= 48 ? servings : null,
      totalMinutes:
        Number.isInteger(summary.totalMinutes) && (summary.totalMinutes ?? 0) > 0
          ? summary.totalMinutes
          : null,
      sourceName: summary.source.publisher,
      sourceUrl,
      license,
      imageUrl,
      imageCredit: imageUrl ? 'AI-generated illustration by Aptiva' : null,
      publisherId:
        mealDB && summary.source.publisher === 'TheMealDB' ? `mealdb:${mealDB}` : undefined,
      matchSourceUrl: !summary.adaptation?.sourceMealId && !license.startsWith('Aptiva adaptation'),
    },
  ];
});

const dir = join(PACKAGE_ROOT, 'sources');
writeFileSync(
  join(dir, 'aptiva.json'),
  `[\n${candidates.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`,
);
writeFileSync(
  join(dir, 'aptiva-exclusions.json'),
  JSON.stringify(
    {
      githubRevision: REVISION,
      catalogRevision: CATALOG_REVISION,
      shipped: summaries.length,
      candidates: candidates.length,
      excluded,
    },
    null,
    2,
  ) + '\n',
);
if (process.argv[3]) {
  writeFileSync(
    process.argv[3],
    JSON.stringify(
      summaries.map((r) => ({
        id: r.id,
        title: r.name,
        url: details.get(r.id)?.source.url,
        ingredients: r.ingredients.map((i) => taxonomy.get(i.ingredientId) ?? i.originalText),
      })),
    ),
  );
}
console.log(
  `Aptiva: ${summaries.length} shipped, ${candidates.length} candidates, ${excluded.length} source exclusions`,
);
