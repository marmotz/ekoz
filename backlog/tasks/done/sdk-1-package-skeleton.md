# sdk-js — package skeleton and tooling

**Status**: done
**Type**: tooling / CI
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/sdk-foundations/technical.md §2](../../features/sdk-foundations/technical.md#2-arborescence-du-paquet), [§12](../../features/sdk-foundations/technical.md#12-build-packaging-distribution).

## Verified findings

- The repo is empty: `git ls-files` → `LICENSE`, `NOTICE` only.
- Repo `AGENTS.md`: TypeScript, Bun, Vitest, ESM (+ CJS), no heavy runtime
  dependency, changeset for any visible change.

## To do

1. `package.json`: name (`@ekozhq/sdk`, confirm in the SDK packaging and protocol-version policy design), `"type": "module"`,
   `exports` map with `import` / `require` / `types`, `"sideEffects": false`,
   `"files": ["dist"]`, `engines` Node >= 20 / Bun. Scripts: `build`, `test`,
   `typecheck`, `lint`.
2. `tsconfig.json`: `NodeNext`, `strict`, `declaration`, no DOM-only lib
   assumptions (target browser + Bun/Node).
3. `tsdown.config.ts`: entry `src/index.ts`, dual ESM + CJS + `.d.ts`.
4. `vitest.config.ts`: node environment, coverage.
5. ESLint flat config aligned with sibling repos.
6. Changesets: init `.changeset/`, config with publish deferred; seed the
   `CHANGELOG.md`.
7. CI workflow (GitHub Actions): typecheck, lint, unit tests, changeset check.
8. `src/index.ts` placeholder exporting nothing yet (compiles).
9. `README.md` stub (filled by the readme task).

## Dependencies

None. First task of the repo.
