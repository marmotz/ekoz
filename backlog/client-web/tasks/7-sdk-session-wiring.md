# Front — câblage SDK et session

**Statut** : à faire
**Type** : front
**Issue** : [#7](https://github.com/ekoz-chat/client-web/issues/7)

Référence : [../features/web-client-foundations/technical.md §7](../features/web-client-foundations/technical.md#7-câblage-sdk-et-session).

## Constat vérifié

Le SDK `@ekoz/sdk` est au stade conception :
[sdk-js technical.md §7–§10](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md).
Surface visée : `createClient({ server, store })`, `SessionStore`
(`load`/`save`/`clear`), événements `session:authenticated` / `session:refreshed`
/ `session:invalid` / `session:cleared`, `sdk.session.getState()` /
`resume()`. Consommé via `bun link` (pas de publication).

## À faire

1. `src/shared/sdk/session-store.ts` : `localStorageSessionStore()` implémentant
   `SessionStore` sur la clé `ekoz.session` ; tolérant à `localStorage` absent /
   JSON corrompu (→ `null`).
2. `src/shared/sdk/client.ts` : `createSdkClient()` →
   `createClient({ server: import.meta.env.VITE_EKOZ_SERVER, store: localStorageSessionStore() })`.
   **Jamais appelé au SSR.**
3. `src/shared/sdk/provider.tsx` : `SdkProvider` crée le client dans un
   `useEffect` (montage unique), appelle `sdk.session.resume()` si le store a un
   refresh token, expose `{ sdk }` via contexte + `useSdk()`. Au SSR : `sdk` =
   `null`.
4. `src/shared/sdk/session.ts` : `useSession()` →
   `{ status: 'unknown' | 'authenticated' | 'anonymous', identifier, sessionId }`.
   `unknown` tant que `sdk` null. Abonnement aux événements `session:*`. Sur
   `session:invalid` : `queryClient.clear()` + `router.navigate({ to: '/login' })`.
5. `src/shared/sdk/require-auth.tsx` : `<RequireAuth>` — `Skeleton` si `unknown`,
   redirection `/login` si `anonymous`, enfants si `authenticated`.
6. `package.json` : `@ekoz/sdk` en dépendance (sans version figée) ; README :
   procédure `bun link`.
7. Brancher le hook de déconnexion exposé par T-query (`QueryCache.onError`) sur
   `useSession`.
8. Tests (module `@ekoz/sdk` mocké via `test/sdk-mock.ts`) :
   `localStorageSessionStore` (round-trip, absent, corrompu) ; `useSession`
   `unknown` → `authenticated` sur event ; `session:invalid` → `anonymous` +
   `queryClient.clear()` + navigation ; `SdkProvider` ne crée rien au rendu
   serveur ; `RequireAuth` (3 états).
9. Entrée `CHANGELOG.md`.

## Dépendances

- [1-scaffold-tanstack-start](1-scaffold-tanstack-start.md)
- [4-tanstack-query-integration](4-tanstack-query-integration.md)
