/**
 * Resolves the bundled catalog database asset.
 *
 * `assets/catalog/famara-catalog.db` is produced by the data pipeline. When it is absent, Metro
 * resolves this require to an empty module (see metro.config.js), so the app still bundles and the
 * catalog loader reports a typed "missing" error at runtime instead.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro assets are only addressable via require.
const catalogModule: unknown = require('../../../assets/catalog/famara-catalog.db');

/** The Metro asset id of the bundled catalog, or null when the build has no catalog. */
export function resolveCatalogAssetId(): number | null {
  return typeof catalogModule === 'number' ? catalogModule : null;
}
