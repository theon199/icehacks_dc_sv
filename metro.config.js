// Metro configuration for Famara.
const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The bundled recipe catalog is a SQLite file shipped as an asset.
config.resolver.assetExts.push('db');

// The catalog file is produced by the data pipeline and may be absent in a fresh checkout.
// Resolve it to an empty module in that case so the app still bundles; the catalog loader then
// reports a typed "missing" error at runtime instead of the bundler failing.
const catalogPath = path.join(__dirname, 'assets', 'catalog', 'famara-catalog.db');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('famara-catalog.db') && !fs.existsSync(catalogPath)) {
    return { type: 'empty' };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
