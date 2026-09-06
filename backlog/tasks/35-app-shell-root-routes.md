# Front — shell applicatif + root route + routes placeholder

**Status**: todo
**Type**: front
**Issue**: [#35](https://github.com/marmotz/ekoz/issues/35)

Référence : [../features/web-client-foundations/technical.md §3](../features/web-client-foundations/technical.md#3-arborescence-cible),
[§6](../features/web-client-foundations/technical.md#6-providers-et-ssr),
[§8](../features/web-client-foundations/technical.md#8-shell-applicatif-sidebar--topbar--thème).

## À faire

1. `src/shared/layout/nav-registry.ts` : tableau d'entrées + `registerNav(entry)`
   (module-level, dédupliqué). Entrée « Home » enregistrée par la route index.
2. `src/shared/layout/sidebar.tsx` : rend le registre ; repliable < md via
   `Sheet`.
3. `src/shared/layout/topbar.tsx` : titre de page (`useMatches()` +
   `staticData.title`), `LanguageSwitcher`, `ThemeToggle`, slot `user-menu`
   (prop `children`, vide ici).
4. `src/shared/layout/app-shell.tsx` : grille sidebar + topbar collante +
   `<main>` scrollable rendant `children` / `<Outlet/>`.
5. `src/app/providers.tsx` : assemble `I18nextProvider` (instance du loader
   racine) + `ThemeProvider` + `QueryClientProvider` + `SdkProvider`.
6. `src/routes/__root.tsx` : `<html>` / `<head>` (`<Meta/>`, `<Scripts/>`,
   script anti-flash thème), `loader` langue (T-i18n), `<Providers><AppShell>
   <Outlet/></AppShell></Providers>`, `<Toaster/>`. `context` du routeur typé
   `{ queryClient, sdk }`.
7. `src/routes/index.tsx` : placeholder — affiche l'état de discovery / du
   serveur (via `useSdk()` si monté, sinon message neutre), `staticData.title`.
8. `src/routes/login.tsx` : placeholder minimal (remplacé par la feature
   `auth`) — cible des redirections `RequireAuth` / `session:invalid`.
9. Tests : `AppShell` rend l'outlet + replie la sidebar sous le breakpoint ;
   topbar affiche `LanguageSwitcher` + `ThemeToggle` ; `nav-registry` dédoublonne ;
   `__root` rend sans erreur en SSR (pas d'accès `localStorage`/SDK au rendu
   serveur).
10. Entrée `CHANGELOG.md`.

## Dépendances

- [30-shadcn-ui-base](7-conv-messages.md)
- [32-theme-provider](9-conv-reactions-and-read-markers.md)
- [33-i18n-react-i18next](10-conv-presence-and-typing.md)
- [31-tanstack-query-integration](8-conv-message-edit-delete-tombstones.md)
- [34-sdk-session-wiring](11-conv-streaming-sync-and-feed.md)
