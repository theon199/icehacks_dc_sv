# Famara — agent guide

Shared instructions for every coding agent (Codex, Cursor, Antigravity, Claude Code via `CLAUDE.md`).

Read `docs/ARCHITECTURE.md` (stack, layout, performance rules, safety invariants) and
`docs/CONTRIBUTING.md` (branching, ownership, quality bar) before changing code. Product behaviour
is in `docs/PRODUCT.md`; catalog schema in `docs/DATA.md`.

Commands: `npm run verify` (typecheck + lint + format:check + test), `npm test -- <path>`,
`npx expo start`. Data pipeline: `cd tools/data && npm run build`.

Key rules: `src/app` routes stay thin; pure logic in `src/domain` with tests; zustand selectors,
react-query for server state; FlashList for lists; `expo-image` for images; tokens from
`src/ui/tokens.ts`; zod at every boundary; allergen filtering is fail-closed.

## iOS simulator: use only the iPhone 18 Pro

Run, install and test **only** on the iPhone 18 Pro simulator (iOS 27.0, bundle id
`com.famara.app`). Never boot, create or install to any other simulator.

- Find its UDID by name: `xcrun simctl list devices | grep "iPhone 18 Pro"`.
- Always name the device; never let a tool pick one:
  - Expo: `npx expo run:ios --device "iPhone 18 Pro"`
  - Maestro: `maestro --device <UDID> test <flow>.yaml`
  - xcodebuildmcp: `--simulator-id <UDID>` (also pinned in `.xcodebuildmcp/config.yaml`)
  - simctl: use the UDID, not `booted`, when more than one simulator could be running.
- Boot it first (`xcrun simctl boot <UDID>`) so tools that use the booted simulator choose it.
  It is headless; there is no Simulator.app.
- Disk is tight: no extra simulators, runtimes or full rebuilds without asking.

### Driving the UI

- Use **Maestro** (`inputText`) for text entry. `xcodebuildmcp ui-automation type-text` /
  `key-sequence` report success but deliver nothing on this headless iOS 27 simulator, and its
  taps are unreliable. `xcodebuildmcp ui-automation snapshot-ui` is fine for reading field values.
- Password fields: tap **Show password** _before_ focusing the field, or iOS's "Use Strong
  Password?" sheet swallows every keystroke except the last.
- After sign-in, iOS shows a system "Save Password?" alert that Maestro cannot match by text;
  dismiss it with `tapOn: { point: "32%,63%" }` ("Not Now").
- Screenshots: `xcrun simctl io <UDID> screenshot <path>.png`.
- Never commit credentials; pass them to Maestro with `-e NAME=value`.
