# monorepo — clear server Biome warnings

**Status**: done
**Type**: chore
**Issue**: [#40](https://github.com/marmotz/ekoz/issues/40)
`bun run lint` is green (exit 0) but `apps/server/src` carries ~23 advisory
Biome warnings inherited from the pre-Biome codebase.

## To do

- `bunx biome check apps/server/src` and fix, file by file:
  - `lint/complexity/useLiteralKeys` — `env['X']` -> `env.X` (mostly `process.env`
    access and test helpers).
  - `lint/style/noNonNullAssertion` in non-test files (`config/registry.ts`,
    `discovery/server-domain.ts`, `auth/session.service.ts`,
    `profile/profile.service.ts`) — narrow the type instead.
  - `lint/suspicious/noTemplateCurlyInString` in
    `modules/identity/**/templates.ts` — these are mail-template placeholders,
    not JS template literals; add a scoped `biome-ignore` or an override for
    `apps/server/src/**/templates.ts`.
- Do NOT run `biome check --write --unsafe` on the server: it rewrites
  `import { X }` used only for `emitDecoratorMetadata` into `import type { X }`
  and breaks NestJS DI. `useImportType` is already `off` in `biome.json`; keep it.

## Done when

`bunx biome check apps/server` reports 0 warnings, server unit + integration
tests still green.
