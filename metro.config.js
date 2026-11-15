// Metro configuration for Famara.
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

module.exports = config;
