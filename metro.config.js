// Metro configuration for Famara.
const fs = require('node:fs');
const path = require('node:path');
const expoMetro = require('expo/metro-config');

/** Expo's defaults for this project, extended below. */
const config = expoMetro.getDefaultConfig(__dirname);

// Other git worktrees live inside the repo (.worktrees/, .claude/worktrees/). Keep Metro from
// watching them, so edits on another branch never hot-reload this app or shadow its modules.
// Anchored to this project's root, so Metro still works when it runs from inside a worktree.
const escapeForRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const worktrees = ['.worktrees', path.join('.claude', 'worktrees')].map(
  (dir) => new RegExp(`^${escapeForRegExp(path.join(__dirname, dir) + path.sep)}.*`),
);
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  ...worktrees,
];

// The bundled recipe catalog is a SQLite file shipped as an asset.
config.resolver.assetExts.push('db');

// The catalog file is produced by the data pipeline and may be absent in a fresh checkout.
// Resolve it to an empty module in that case so the app still bundles; the catalog loader then
// reports a typed "missing" error at runtime instead of the bundler failing. Metro caches this
// decision, so after the catalog first appears restart the bundler with `npx expo start -c`.
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
