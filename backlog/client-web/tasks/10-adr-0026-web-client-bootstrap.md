# Spec — the repository layout bootstrap du client web

**Statut** : à faire
**Type** : doc
**Repo** : ekoz-chat/spec
**Issue** : [#10](https://github.com/ekoz-chat/client-web/issues/10)

Référence : [../features/web-client-foundations/technical.md §14](../features/web-client-foundations/technical.md#14-adr-à-écrire-dans-spec).

## Constat vérifié

`spec/docs/technical/adr/` s'arrête à `0024` ; `0025` est réservé par
[sdk-js foundations](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md).
Confirmer le numéro à l'écriture (le premier des deux incréments livrés prend
`0025`).

## À faire

1. Écrire `spec/docs/technical/adr/0026-web-client-bootstrap.md` (Context /
   Decision / Consequences).
2. Décisions à acter :
   - **TanStack Start** comme socle (SSR + hydratation, runtime serveur Nitro,
     sortie Node) — évolution d'
     [web client stack](../../../docs/technical/web-client-stack.md)
     qui ne nommait que « Vite ». Assumer le runtime serveur au déploiement.
   - Routing TanStack Router (embarqué), routes file-based.
   - i18n react-i18next, instance par requête, détection `localStorage` +
     `Accept-Language`, `fallbackLng: 'en'`, namespace par feature.
   - Shell : sidebar repliable + topbar ; thème `light`/`dark`/`system` persisté
     + script anti-flash ; registre de navigation alimenté par les features
     (pas d'import croisé).
   - Session : SDK client-only, adaptateur `SessionStore` sur `localStorage`,
     réactivité via événements `session:*`, `RequireAuth` + `useSession()` ; pas
     de garde de session côté serveur dans cet incrément.
   - `eslint-plugin-boundaries` : matrice `feature` / `shared` / `routes` /
     `app` / `server`.
   - Tests : mock du module `@ekoz/sdk`, pas de MSW.
3. Mettre à jour l'index `spec/docs/technical/adr/README.md`.
4. Référencer l'ADR par numéro depuis le `AGENTS.md` de `client-web` si
   pertinent.

## Dépendances

Aucune (peut être écrit en parallèle ; doit refléter l'état final du
technical.md).
