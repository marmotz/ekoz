# CI — workflow GitHub Actions

**Status**: todo
**Type**: CI
**Issue**: [#36](https://github.com/marmotz/ekoz/issues/36)

Référence : [../features/web-client-foundations/technical.md §11](../features/web-client-foundations/technical.md#11-ci).

## À faire

1. `.github/workflows/ci.yml` : déclenché sur `push` (develop) et `pull_request`.
2. Étapes : `oven-sh/setup-bun`, `bun install`, `bun run lint`,
   `bun run typecheck`, `bun run test`, `bun run build`.
3. Récupérer `@ekozhq/sdk` non publié : `actions/checkout` du dépôt
   `@ekozhq/sdk` via workspace, `bun link`, ou tarball — trancher ici, documenter dans
   le README.
4. Check CHANGELOG : si des fichiers `src/**` sont modifiés dans la PR, exiger
   une entrée ajoutée sous `## [Unreleased]` de `CHANGELOG.md`
   ([changelog discipline](../../CONTRIBUTING.md)).
5. Pas de job de déploiement dans cet incrément.
6. Entrée `CHANGELOG.md`.

## Dépendances

- [28-scaffold-tanstack-start](5-conv-dm-and-group-dm.md)
- [29-eslint-boundaries](6-conv-directory.md)
