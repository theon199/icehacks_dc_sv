# Famara — agent guide

Read `docs/ARCHITECTURE.md` (stack, layout, performance rules, safety invariants) and
`docs/CONTRIBUTING.md` (branching, ownership, quality bar) before changing code. Product behaviour
is in `docs/PRODUCT.md`; catalog schema in `docs/DATA.md`.

Commands: `npm run verify` (typecheck + lint + format:check + test), `npm test -- <path>`,
`npx expo start`. Data pipeline: `cd tools/data && npm run build`.

Key rules: `src/app` routes stay thin; pure logic in `src/domain` with tests; zustand selectors,
react-query for server state; FlashList for lists; `expo-image` for images; tokens from
`src/ui/tokens.ts`; zod at every boundary; allergen filtering is fail-closed.
