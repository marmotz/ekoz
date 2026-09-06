# Front — intégration TanStack Query (SSR)

**Statut** : à faire
**Type** : front
**Issue** : [#4](https://github.com/ekoz-chat/client-web/issues/4)

Référence : [../features/web-client-foundations/technical.md §6](../features/web-client-foundations/technical.md#6-providers-et-ssr).

## À faire

1. `src/app/query-client.ts` : `createQueryClient()` — **nouvelle instance par
   requête** (pas de singleton module-level). Defaults : `staleTime` 30 s,
   `retry` 1 sauf erreurs `AuthenticationError` / statut `4xx` du SDK (pas de
   retry), `refetchOnWindowFocus: false`.
2. `QueryCache.onError` global : les `AuthenticationError` non gérées émettent un
   signal de déconnexion consommé par `useSession` (T-sdk) — exposer un point
   d'accroche (callback injecté ou event bus léger) sans dépendre de
   `shared/sdk`.
3. Intégration SSR : `@tanstack/react-router-ssr-query` (ou l'utilitaire Start
   équivalent) — déshydratation/réhydratation du cache. `queryClient` ajouté au
   `context` du routeur dans `src/router.tsx`.
4. `src/app/providers.tsx` : `QueryClientProvider` + devtools en dev.
5. Tests : `createQueryClient` renvoie des instances distinctes ; pas de retry
   sur une erreur simulée `4xx` ; `onError` déclenche le hook de déconnexion.
6. Entrée `CHANGELOG.md`.

## Dépendances

- [1-scaffold-tanstack-start](1-scaffold-tanstack-start.md)
