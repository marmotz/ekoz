# Front — ESLint flat config + eslint-plugin-boundaries

**Statut** : à faire
**Type** : front
**Issue** : [#2](https://github.com/ekoz-chat/client-web/issues/2)

Référence : [../features/web-client-foundations/technical.md §5](../features/web-client-foundations/technical.md#5-lint-et-frontières).

## À faire

1. `eslint.config.js` (flat) : `@eslint/js` recommended, `typescript-eslint`,
   `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.
2. Ajouter `eslint-plugin-boundaries`. Éléments :
   - `app` → `src/app/**`
   - `server` → `src/server/**`
   - `routes` → `src/routes/**`
   - `shared` → `src/shared/**`
   - `feature` → `src/features/*/**` (mode `full`, un élément par dossier)
3. Règles `boundaries/element-types` (défaut `disallow`) :
   - `feature` : autorisé `shared` + sa propre `feature`.
   - `shared` : autorisé `shared` uniquement.
   - `routes` : autorisé `shared`, `feature`, `app`, `server`.
   - `app` / `server` : autorisé `shared`, `app`, `server`.
4. Activer `boundaries/no-private`, `boundaries/no-unknown`,
   `boundaries/no-unknown-files`.
5. Ignorer `routeTree.gen.ts`, `.output/`, `dist/`.
6. `bun run lint` vert sur l'arbo existante.
7. Test / fixture : un import croisé `features/a` → `features/b` déclenche une
   erreur de lint (test de garde, ou script CI dédié).
8. Entrée `CHANGELOG.md`.

## Dépendances

- [1-scaffold-tanstack-start](1-scaffold-tanstack-start.md)
