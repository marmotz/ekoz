# Front — scaffold TanStack Start

**Statut** : à faire
**Type** : front
**Issue** : [#1](https://github.com/ekoz-chat/client-web/issues/1)

Référence : [../features/web-client-foundations/technical.md §3](../features/web-client-foundations/technical.md#3-arborescence-cible),
[§4](../features/web-client-foundations/technical.md#4-outillage-et-build).

## Constat vérifié

Dépôt vide : `git ls-files` → `AGENTS.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`.
Tout est créé par cet incrément. Stack imposée par
[web client stack](../../../docs/technical/web-client-stack.md) ;
socle TanStack Start acté au technical.md §2.

## À faire

1. Scaffold via `bunx @tanstack/cli@latest create` (template React + Vite), puis
   nettoyer le contenu de démo.
2. `vite.config.ts` : plugins `tanstackStart()`, `viteReact()`, `tailwindcss()`
   (`@tailwindcss/vite`), `tsconfigPaths()`.
3. `tsconfig.json` strict : `strict`, `noUncheckedIndexedAccess`,
   `verbatimModuleSyntax` ; alias `@/*` → `src/*`.
4. `src/styles/globals.css` : `@import "tailwindcss";` + bloc `@theme` +
   variables CSS shadcn pour `:root` et `.dark` (valeurs par défaut, affinées en
   T-thème / T-shadcn).
5. `src/router.tsx` : `createRouter({ routeTree, context: { queryClient: null, sdk: null } })`
   (contexte complété par T-query / T-sdk). `src/routes/__root.tsx` minimal
   (`<html>`, `<head>` avec `<Meta/>` + `<Scripts/>`, `<Outlet/>`).
   `src/routes/index.tsx` : page placeholder.
6. `package.json` scripts : `dev` (`vite dev`), `build` (`vite build`),
   `start` (`node .output/server/index.mjs`), `typecheck` (`tsc --noEmit`),
   `lint` (`eslint .`), `test` (`vitest run`), `test:watch` (`vitest`).
7. `.env.example` : `VITE_EKOZ_SERVER=http://localhost:3001`.
8. `vitest.config.ts` : `environment: 'jsdom'`, `setupFiles: ['test/setup.ts']`.
   `test/setup.ts` : `@testing-library/jest-dom`, `cleanup()`, polyfills
   `matchMedia` / `localStorage`.
9. `routeTree.gen.ts` committé, marqué `linguist-generated` dans
   `.gitattributes`.
10. `.gitignore` (`.output`, `node_modules`, `.env`, ...).
11. `CHANGELOG.md` : entrée sous `## [Unreleased]`.
12. Test minimal : la route `index` rend son placeholder via
    `renderWithProviders` (helper `test/render.tsx` créé ici, providers ajoutés
    au fil des tâches).

## Dépendances

Aucune.
