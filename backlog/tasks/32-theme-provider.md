# Front — thème light/dark/system

**Status**: todo
**Type**: front
**Issue**: [#32](https://github.com/marmotz/ekoz/issues/32)

Référence : [../features/web-client-foundations/technical.md §6](../features/web-client-foundations/technical.md#6-providers-et-ssr),
[§8](../features/web-client-foundations/technical.md#8-shell-applicatif-sidebar--topbar--thème).

## À faire

1. `src/app/theme.tsx` : `ThemeProvider` + `useTheme()`.
   - État `theme: 'light' | 'dark' | 'system'`, persisté `localStorage`
     (`ekoz.theme`).
   - Applique/retire la classe `dark` sur `document.documentElement`.
   - En mode `system`, écoute `matchMedia('(prefers-color-scheme: dark)')`.
2. `src/app/theme-script.ts` : chaîne du script inline (IIFE) qui lit
   `ekoz.theme` et pose la classe avant le premier paint. Injectée dans le
   `<head>` de `__root.tsx` (branché en T-shell).
3. `ThemeToggle` (dans `src/shared/layout/` ou `src/shared/ui/`) : `DropdownMenu`
   light / dark / system, i18n-ready (clés ajoutées en T-i18n ou ici avec
   fallback).
4. Tests : applique/retire `.dark` selon le choix ; réagit au changement de
   `prefers-color-scheme` en mode `system` ; persiste ; le script inline pose la
   bonne classe pour une valeur stockée donnée.
5. Entrée `CHANGELOG.md`.

## Dépendances

- [28-scaffold-tanstack-start](5-conv-dm-and-group-dm.md)
- [30-shadcn-ui-base](7-conv-messages.md)
