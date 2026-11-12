# Contributing to Famara

## Workflow

1. Branch from latest `main`: `feat/<area>-<short>`, `fix/<short>`, `chore/<short>`.
2. Small, focused commits with Conventional Commit messages (`feat(discover): swipe deck`).
3. Before pushing: `npm run verify` (typecheck, lint, format check, tests) must pass.
4. Open a PR with: summary, what changed, how it was tested, screenshots if UI, follow-ups.
5. Every PR gets an independent review (and Codex review). Address all blocking comments.
6. Squash-merge when CI is green and review approves.

## Ownership while building in parallel

Each work item owns specific folders (listed in its brief). Do not edit files outside your folders
except: adding a route file under `src/app/` that mounts your screen, adding a migration with a
fresh timestamp, and exporting from your feature's `index.ts`. Shared files (`package.json`,
`src/ui/*`, `src/lib/*`, root layouts) change only in foundation PRs; if you need a change there,
note it in your PR under "Follow-ups" instead of editing it.

## Quality bar

- Typecheck clean, zero lint warnings, tests for every non-trivial pure function and every hook
  with logic, RNTL tests for key screens' happy path.
- No `any`, no `@ts-ignore`, no `eslint-disable` without a reason comment.
- No secrets in code. Client env vars are only `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Original work only: write everything from scratch.
