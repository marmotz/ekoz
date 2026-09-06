# CI — workflow GitHub Actions

**Statut** : à faire
**Type** : CI
**Issue** : [#9](https://github.com/ekoz-chat/client-web/issues/9)

Référence : [../features/web-client-foundations/technical.md §11](../features/web-client-foundations/technical.md#11-ci).

## À faire

1. `.github/workflows/ci.yml` : déclenché sur `push` (develop) et `pull_request`.
2. Étapes : `oven-sh/setup-bun`, `bun install`, `bun run lint`,
   `bun run typecheck`, `bun run test`, `bun run build`.
3. Récupérer `@ekoz/sdk` non publié : `actions/checkout` du dépôt
   `ekoz-chat/sdk-js` + `bun link`, ou tarball — trancher ici, documenter dans
   le README.
4. Check CHANGELOG : si des fichiers `src/**` sont modifiés dans la PR, exiger
   une entrée ajoutée sous `## [Unreleased]` de `CHANGELOG.md`
   ([changelog discipline](../../../CONTRIBUTING.md)).
5. Pas de job de déploiement dans cet incrément.
6. Entrée `CHANGELOG.md`.

## Dépendances

- [1-scaffold-tanstack-start](1-scaffold-tanstack-start.md)
- [2-eslint-boundaries](2-eslint-boundaries.md)
