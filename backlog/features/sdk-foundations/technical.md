# SDK foundations — conception technique

**Statut** : en conception. Découle de [overview.md](./overview.md) (décisions
actées). Ne modifie aucun code pendant cette phase.

## 1. Périmètre

Premier incrément du paquet `@ekozhq/sdk` (nom réel à fixer dans `docs/technical/`) : le cœur
transport plus les bindings de la surface identité déjà exposée par le serveur
de référence. Hors périmètre ici : le flux SSE (`GET /events`), le ticket de
stream (`POST /stream/ticket`), `/sync`, tout binding conversationnel.

Le dépôt `sdk-js` est vide (`git ls-files` → `LICENSE`, `NOTICE`). Tout est créé
par cet incrément.

### Références externes

- [federation protocol](../../../docs/technical/federation-protocol.md)
  — découplage identité / hosting, discovery.
- [authentication and sessions](../../../docs/technical/auth-and-sessions.md)
  — access JWT court + refresh opaque rotatif, denylist `sid`, ticket SSE.
- [web client stack](../../../docs/technical/web-client-stack.md)
  — aucun client n'appelle `fetch` directement.
- [HTTP API conventions](../../../docs/technical/api-conventions.md)
  — `application/problem+json`, `code` stable namespacé, `X-Request-Id`, `422 validation_failed`.
- [entity identifier format](../../../docs/technical/entity-identifier-format.md)
  — identifiants ULID opaques.
- [identity account and token mechanics](../../../docs/technical/identity-account-and-token-mechanics.md)
  — format JWS de l'access token, enregistrement du refresh, détection de réutilisation.
- [discovery.md](https://github.com/marmotz/ekoz/blob/develop/docs/protocol/discovery.md)
  — `GET /.well-known/ekoz`.
- [protocol/README.md](https://github.com/marmotz/ekoz/blob/develop/docs/protocol/README.md)
  — section « Authentication and sessions » / « Identity and profiles » encore à l'état de squelette.

## 2. Arborescence du paquet

```
sdk-js/
  package.json            # "type": "module", exports ESM+CJS+types, sideEffects: false
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  src/
    index.ts              # surface publique : createClient, types, classes d'erreur
    client.ts             # createClient(config) -> EkozClient
    config.ts             # ClientConfig, résolution/normalisation
    transport/
      http-client.ts      # requête fetch, en-têtes, décodage problem+json, replay
      problem.ts          # ProblemDetails + mapping code -> classe d'erreur
      errors.ts           # EkozError et sous-classes typées
      request-context.ts  # génération/propagation X-Request-Id
    discovery/
      discovery.ts        # GET /.well-known/ekoz, cache, garde de version protocole
    session/
      session-manager.ts  # tokens en mémoire, refresh single-flight, restore
      session-store.ts    # interface SessionStore + adaptateur mémoire par défaut
      events.ts           # émetteur d'événements typé (on/off/once)
    resources/
      setup.ts  auth.ts  me.ts  sessions.ts  users.ts
      invitations.ts  admin.ts
    types/
      wire.ts             # types de payloads alignés protocole v0
  test/                   # unitaires (fetch mické) + intégration opt-in
```

## 3. Cœur transport — `HttpClient`

Une instance configurée, créée par `createClient`, partagée par toutes les
ressources.

- `fetch` global (navigateur, Bun, Node ≥ 20). Aucune dépendance runtime
  (`FormData`, `Blob`, `AbortController`, `crypto.randomUUID` sont globaux sur
  les trois cibles).
- En-têtes par défaut sur chaque requête :
  - `Accept: application/json`
  - `X-Ekoz-Protocol: 0` (cf. §5)
  - `X-Request-Id: <uuid v4>` sauf si l'appelant en fournit un
    ([HTTP API conventions](../../../docs/technical/api-conventions.md)).
  - `Authorization: Bearer <access token>` injecté par le `SessionManager` pour
    les appels authentifiés.
- Corps : `application/json` sérialisé, sauf `me.setAvatar` qui envoie un
  `FormData` (champ `file`) sans forcer le `Content-Type` (boundary gérée par
  la plateforme). Cf.
  [profile.controller.ts:46](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/profile/profile.controller.ts#L46).
- Réponses `204` / corps vide → `undefined`. `200`/`201`/`202` → JSON typé.
- Pas de retry réseau automatique dans cet incrément (le backoff jitteré est
  réservé au SSE/`/sync` de l'incrément conversations, cf. overview). Seule
  exception : le replay unique après refresh (§7).
- `AbortSignal` accepté par appel (`{ signal }`), propagé à `fetch`.

## 4. Discovery et résolution de l'API

`createClient({ server })` ne reçoit **pas** d'URL d'API (décision overview :
domaine + résolution discovery, fidèle à
[federation protocol](../../../docs/technical/federation-protocol.md)).

- Au premier appel réseau, le SDK récupère `GET https://<server>/.well-known/ekoz`
  et lit `api` (base URL REST, sans `/` final), `web`, `protocol_versions`.
  Forme du document :
  [discovery.service.ts:20](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/core/discovery/discovery.service.ts#L20),
  [discovery.md](https://github.com/marmotz/ekoz/blob/develop/docs/protocol/discovery.md).
- Résultat mis en cache en mémoire pour la durée de vie du client (le
  `Cache-Control: public, max-age=300` du serveur n'est pas re-géré ici ;
  `sdk.discovery.refresh()` force un rafraîchissement).
- `sdk.discovery.get()` expose le document brut (les clients en ont besoin pour
  `web` — liens d'e-mails — et plus tard pour les clés de signature).
- Dev via `bun link` : le serveur de référence doit être joignable et servir sa
  discovery. Un hook d'échappement `createClient({ resolveApiUrl })` (fonction
  fournie par le consommateur, renvoie la base URL) couvre le cas local sans
  ouvrir un second champ de config concurrent — à confirmer à l'implémentation
  si le besoin est réel.

## 5. Version de protocole

Décision overview : en-tête **plus** garde discovery.

- Constante `SUPPORTED_PROTOCOL_MAJORS = ['0']` dans le paquet.
- Chaque requête porte `X-Ekoz-Protocol: 0`. Le serveur ne lit pas encore cet
  en-tête (`grep -rn protocol src/` → seule la discovery expose
  `protocol_versions`) ; il est donc informatif aujourd'hui. `docs/technical/` (§16) doit
  aussi acter que le serveur ajoute un lecteur tolérant (ignore l'inconnu, ne
  casse rien) — tâche côté `server`.
- À la résolution de la discovery, si
  `protocol_versions ∩ SUPPORTED_PROTOCOL_MAJORS = ∅` → `ProtocolMismatchError`
  (classe typée, non rattachée à un `code` serveur), levée avant tout appel
  métier.

## 6. Modèle d'erreurs typées

Décision overview : exceptions typées, pas de `Result`.

- Hiérarchie : `EkozError` (base) porte `code`, `status`, `detail`, `title`,
  `requestId`, `retryAfter?`. Le corps `problem+json` est celui d'
  [HTTP API conventions](../../../docs/technical/api-conventions.md) :
  [problem-details.ts:26](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/core/http/problem-details.ts#L26).
- Sous-classes transverses : `ValidationError` (`code = validation_failed`,
  expose `issues: {path, message}[]`), `NotFoundError`, `RateLimitError`
  (`code = auth.too_many_requests`, lit l'en-tête `Retry-After` →
  [identity.errors.ts:229](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/identity.errors.ts#L229)),
  `AuthenticationError` (`auth.unauthenticated`), `ServerError` (`status ≥ 500`,
  `code = internal_error`), `NetworkError` (échec `fetch`, pas de réponse).
- Erreurs métier identité mappées depuis le `code` stable, table issue de
  [identity.errors.ts](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/identity.errors.ts) :
  `auth.invalid_credentials` → `InvalidCredentialsError`,
  `auth.refresh_invalid` → `RefreshInvalidError`,
  `auth.refresh_reuse` → `RefreshReuseError`,
  `identity.account_suspended` → `AccountSuspendedError`,
  `identity.email_not_verified` → `EmailNotVerifiedError`,
  `identity.username_taken` → `UsernameTakenError`,
  `identity.registration_closed` → `RegistrationClosedError`,
  `identity.invitation_invalid` → `InvitationInvalidError`,
  `identity.email_taken` → `EmailTakenError`,
  `identity.password_too_weak` → `WeakPasswordError`,
  `identity.username_immutable` → `UsernameImmutableError`,
  `identity.username_change_cooldown` → `UsernameChangeCooldownError`,
  `identity.last_owner` → `LastOwnerError`, etc.
- Un `code` inconnu tombe sur `EkozError` générique en conservant `code` brut :
  le SDK ne se casse pas si le serveur ajoute un code avant le SDK.
- Décodage centralisé : un seul chemin dans `transport/problem.ts`, quel que
  soit l'endpoint (objectif [HTTP API conventions](../../../docs/technical/api-conventions.md)).
- `requestId` renseigné depuis `problem.requestId` sinon depuis le
  `X-Request-Id` envoyé, pour la corrélation support.

## 7. Cycle de vie tokens et sessions — `SessionManager`

Modèle serveur :
[authentication and sessions](../../../docs/technical/auth-and-sessions.md) +
[identity account and token mechanics](../../../docs/technical/identity-account-and-token-mechanics.md).
Access JWT ~15 min, refresh opaque rotatif à usage unique, réutilisation d'un
refresh consommé → révocation de toute la session + `auth.refresh_reuse`.

- État en mémoire : `{ accessToken, accessExpiresAt, refreshToken, sessionId, identifier }`.
- **L'access token n'est jamais persisté** (court, re-frappé depuis le refresh).
  Seul l'état persistable (`refreshToken`, `sessionId`, `identifier`) passe au
  `SessionStore`.
- Établissement d'une session : réponses de
  `POST /setup/owner`
  ([setup-owner.service.ts:19](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/setup-owner.service.ts#L19)),
  `POST /auth/login`
  ([auth.controller.ts:32](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/auth.controller.ts#L32) —
  `{ accessToken, refreshToken, expiresIn, session }`).
  `POST /auth/register` ne renvoie **pas** de tokens
  ([registration.controller.ts:30](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/registration.controller.ts#L30) —
  `AccountView` seul) : après inscription le consommateur enchaîne `login`.
- Refresh sur 401 :
  - Déclenché seulement si la réponse a `code = auth.unauthenticated` (access
    token expiré/invalide,
    [auth.guard.ts](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/guards/auth.guard.ts)),
    et si un `refreshToken` est en mémoire. Pas sur `auth.invalid_credentials`
    (login), pas sur `identity.account_suspended` (403).
  - Appelle `POST /auth/refresh` (`{ refreshToken }` →
    `{ accessToken, refreshToken, expiresIn }`,
    [auth.service.ts refresh](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/auth.service.ts)),
    remplace l'état, `SessionStore.save(...)`, puis **rejoue une seule fois** la
    requête d'origine.
  - **Single-flight** : une seule promesse de refresh partagée ; les requêtes
    concurrentes qui prennent un 401 attendent la même résolution.
  - Refresh en échec (`auth.refresh_reuse` ou `auth.refresh_invalid`,
    [identity.errors.ts:52](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/identity.errors.ts#L52)) :
    on vide l'état, `SessionStore.clear()`, on émet `session:invalid`
    (`reason: 'refresh_reuse' | 'refresh_failed'`), et l'appel initial rejette
    avec l'erreur typée correspondante.
- Refresh proactif optionnel : si `accessExpiresAt` est dépassé avant un appel
  authentifié, refresh d'abord (évite un aller-retour 401 systématique).
- `logout` : `POST /auth/logout` (204), puis vidage local + `SessionStore.clear()`
  + `session:invalid` (`reason: 'logout'`), même si l'appel réseau échoue.
- Restauration : `createClient` appelle `SessionStore.load()` ; si un
  `refreshToken` est présent, l'état est monté « à froid » (pas d'access token) ;
  le premier appel authentifié — ou `sdk.session.resume()` explicite — force un
  refresh. Un refresh raté à ce stade émet `session:invalid` et laisse le client
  non authentifié (pas d'exception non catchée).

## 8. Adaptateur de stockage — `SessionStore`

```ts
interface SessionState {
  refreshToken: string;
  sessionId: string;
  identifier: string | null;
}
interface SessionStore {
  load(): SessionState | null | Promise<SessionState | null>;
  save(state: SessionState): void | Promise<void>;
  clear(): void | Promise<void>;
}
```

- Fourni par le consommateur à `createClient({ store })`. Sync ou async
  (toujours `await`é en interne).
- Défaut si absent : `memoryStore()` (Map en mémoire de process) — utile pour un
  usage serveur court ou les tests.
- `save` appelé à chaque rotation de token (login, setup, chaque refresh),
  `clear` à chaque fin de session. Le SDK n'impose aucun `localStorage` (non
  disponible hors navigateur).

## 9. Émetteur d'événements

Décision overview : émetteur complet, pas un simple callback.

`EkozClient` expose `on(event, listener)`, `off(event, listener)`, `once(...)`.
Événements typés :

| Événement              | Payload                                              | Émis quand |
| ---------------------- | --------------------------------------------------- | ---------- |
| `session:authenticated`| `{ identifier: string \| null, sessionId: string }` | login / setup / resume réussi |
| `session:refreshed`    | `{ sessionId: string }`                             | refresh réussi |
| `session:invalid`      | `{ reason: 'refresh_reuse' \| 'refresh_failed' \| 'logout' \| 'account_suspended' }` | session non récupérable |
| `session:cleared`      | `{}`                                                | état local vidé (suit `session:invalid` et `logout`) |

`account_suspended` : émis quand un appel authentifié prend
`identity.account_suspended` (le serveur a révoqué toutes les sessions,
[auth.guard.ts](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/guards/auth.guard.ts)).
Implémentation maison (~30 lignes), pas de dépendance `EventEmitter` Node.

## 10. Surface publique

`createClient(config)` → `EkozClient`. Namespaces (décision overview : client
unique à namespaces). Toutes les méthodes authentifiées passent par le
`SessionManager`.

| Méthode SDK | Endpoint serveur | Source |
| ----------- | ---------------- | ------ |
| `setup.createOwner(body)` | `POST /setup/owner` | [setup.controller.ts:19](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/setup.controller.ts#L19) |
| `auth.register(body)` | `POST /auth/register` (modes `open`/`invite`/`admin`, `invitationToken` optionnel) | [registration.controller.ts:25](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/registration.controller.ts#L25) |
| `auth.login(body)` | `POST /auth/login` | [auth.controller.ts:20](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/auth.controller.ts#L20) |
| `auth.logout()` | `POST /auth/logout` | [auth.controller.ts:48](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/auth.controller.ts#L48) |
| `auth.verifyEmail({ token })` | `POST /auth/verify-email` | [email-verification.controller.ts:25](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/email-verification/email-verification.controller.ts#L25) |
| `auth.resendVerification({ email })` | `POST /auth/verify-email/resend` | [email-verification.controller.ts:34](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/email-verification/email-verification.controller.ts#L34) |
| `auth.requestPasswordReset({ email })` | `POST /auth/password-reset/request` | [password-reset.controller.ts:22](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/password-reset.controller.ts#L22) |
| `auth.confirmPasswordReset({ token, newPassword })` | `POST /auth/password-reset/confirm` | [password-reset.controller.ts:35](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/password-reset.controller.ts#L35) |
| `me.get()` | `GET /me` | [profile.controller.ts:33](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/profile/profile.controller.ts#L33) |
| `me.updateProfile({ displayName?, bio? })` | `PATCH /me/profile` | [profile.controller.ts:38](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/profile/profile.controller.ts#L38) |
| `me.setAvatar(file: Blob \| File)` | `PUT /me/avatar` (multipart `file`) | [profile.controller.ts:46](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/profile/profile.controller.ts#L46) |
| `me.deleteAvatar()` | `DELETE /me/avatar` | [profile.controller.ts:59](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/profile/profile.controller.ts#L59) |
| `me.changeEmail({ newEmail, password })` | `POST /me/email` | [email-verification.controller.ts:56](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/email-verification/email-verification.controller.ts#L56) |
| `me.changeUsername({ name })` | `PATCH /me/username` → `{ status: 'applied', identifier } \| { status: 'pending', requestId }` | [username.controller.ts:15](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/username.controller.ts#L15), [username.service.ts:15](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/username.service.ts#L15) |
| `me.deleteAccount({ password })` | `DELETE /me` | [lifecycle.controller.ts:73](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/lifecycle.controller.ts#L73) |
| `users.getProfile(identifier)` | `GET /users/:identifier` | [profile.controller.ts:75](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/profile/profile.controller.ts#L75) |
| `sessions.list()` | `GET /sessions` | [sessions.controller.ts:19](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/sessions.controller.ts#L19) |
| `sessions.rename(id, { deviceName })` | `PATCH /sessions/:id` | [sessions.controller.ts:26](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/sessions.controller.ts#L26) |
| `sessions.revoke(id)` | `DELETE /sessions/:id` | [sessions.controller.ts:37](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/sessions.controller.ts#L37) |
| `sessions.revokeAllOthers()` | `DELETE /sessions?all=true` → `{ revoked }` | [sessions.controller.ts:44](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/sessions.controller.ts#L44) |
| `invitations.create({ email?, expiresInDays? })` | `POST /invitations` (owner) → `{ id, token, url, expiresAt }` | [invitations.controller.ts:22](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/invitations/invitations.controller.ts#L22) |
| `invitations.list()` | `GET /invitations` (owner) | [invitations.controller.ts:44](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/invitations/invitations.controller.ts#L44) |
| `invitations.revoke(id)` | `DELETE /invitations/:id` (owner) | [invitations.controller.ts:49](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/invitations/invitations.controller.ts#L49) |
| `admin.users.create(body)` | `POST /admin/users` (owner) | [registration.controller.ts:49](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/registration.controller.ts#L49) |
| `admin.users.suspend(id, { reason })` | `POST /admin/users/:id/suspend` (owner) | [lifecycle.controller.ts:22](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/lifecycle.controller.ts#L22) |
| `admin.users.unsuspend(id)` | `POST /admin/users/:id/unsuspend` (owner) | [lifecycle.controller.ts:32](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/lifecycle.controller.ts#L32) |
| `admin.users.delete(id)` | `DELETE /admin/users/:id` (owner) | [lifecycle.controller.ts:38](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/lifecycle.controller.ts#L38) |
| `admin.owners.add({ userId })` | `POST /admin/owners` (owner) | [lifecycle.controller.ts:51](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/lifecycle.controller.ts#L51) |
| `admin.owners.remove(userId)` | `DELETE /admin/owners/:userId` (owner) | [lifecycle.controller.ts:60](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/lifecycle.controller.ts#L60) |
| `admin.usernameRequests.list(status?)` | `GET /admin/username-requests` (owner) | [username.controller.ts:32](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/username.controller.ts#L32) |
| `admin.usernameRequests.approve(id)` | `POST /admin/username-requests/:id/approve` → `{ identifier }` | [username.controller.ts:37](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/username.controller.ts#L37) |
| `admin.usernameRequests.reject(id)` | `POST /admin/username-requests/:id/reject` | [username.controller.ts:42](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/username.controller.ts#L42) |
| `discovery.get()` / `discovery.refresh()` | `GET /.well-known/ekoz` | [discovery.controller.ts:15](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/core/discovery/discovery.controller.ts#L15) |
| `session.getState()` / `session.resume()` / `session.clear()` / `on` / `off` | — (local, cf. §7–§9) | — |

Non bindé (hors périmètre) : `POST /stream/ticket`
([stream.controller.ts:16](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/stream.controller.ts#L16)),
`GET /users/:identifier/avatar` (le SDK expose `avatarUrl` du profil, le
téléchargement binaire viendra si un consommateur en a besoin),
`GET /blobs/:id`, `GET /healthz`, `/metrics`.

## 11. Typage bout-en-bout

- `src/types/wire.ts` redéclare les payloads (requêtes et réponses) alignés sur
  le protocole v0. Sources actuelles : les DTO Zod et les *views* du serveur
  (`*.dto.ts`, `account.view.ts`
  [account.view.ts:5](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/accounts/account.view.ts#L5),
  `session.view.ts`
  [session.view.ts:4](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/auth/session.view.ts#L4),
  `MeView` / `PublicProfileView`
  [profile.service.ts:22](https://github.com/marmotz/ekoz/blob/develop/apps/server/src/modules/identity/profile/profile.service.ts#L22)).
- Pas de validation runtime des réponses (pas de `zod` en dépendance : poids,
  et double source de vérité). Le SDK fait confiance au contrat ; un écart
  observé est un bug de contrat.
- La section « Identity and profiles » de
  [`spec/docs/protocol/`](https://github.com/marmotz/ekoz/blob/develop/docs/protocol/README.md)
  est un squelette. Discipline
  [HTTP API conventions](../../../docs/technical/api-conventions.md) /
  `AGENTS.md` : cet incrément doit **contribuer** cette section à `spec` (le
  wire contract identité + le namespace de `code`), pas se contenter de la
  déduire du code serveur. Tâche transverse (§17).
- Un décalage constaté avec `spec` se corrige dans `spec`, jamais contourné ici.

## 12. Build, packaging, distribution

- **tsdown** (décision overview / §14) : `src/index.ts` → `dist/` ESM + CJS +
  `.d.ts` en une passe. `package.json` : `"type": "module"`, `exports` avec
  `import`/`require`/`types`, `"sideEffects": false`, `"files": ["dist"]`,
  `engines` Node ≥ 20 / Bun.
- Aucune dépendance runtime. `devDependencies` : `typescript`, `tsdown`,
  `vitest`, `@types/node`.
- Distribution : `bun link` / `npm link` depuis un checkout voisin
  ([overview.md](./overview.md),
  [web-client-foundations](https://github.com/marmotz/ekoz/blob/develop/apps/client-web/backlog/features/web-client-foundations/overview.md)).
  Pas de publication npm, pas de changeset de release tant que la surface n'est
  pas stable. Le `AGENTS.md` du dépôt impose un changeset pour tout changement
  visible : à cadrer dans l'ADR (probable : changesets activés dès maintenant
  pour le `CHANGELOG.md`, publication différée).
- La version du SDK déclare la plage de versions de protocole supportées
  (`AGENTS.md`, §5).

## 13. Tests

- **Unitaires** (Vitest, `fetch` mické) : décodage `problem+json` → bonne classe
  d'erreur ; `X-Request-Id` généré/propagé/surfacé ; refresh sur
  `auth.unauthenticated` + replay unique ; single-flight (N appels concurrents →
  1 seul `POST /auth/refresh`) ; `auth.refresh_reuse` → `session:invalid` +
  `store.clear()` ; pas de refresh sur `auth.invalid_credentials` ; garde de
  version protocole ; construction du `FormData` avatar ; `SessionStore`
  mémoire ; restauration à froid.
- **Intégration opt-in** : suite gardée par une variable d'env pointant un
  serveur de référence local (Docker), jouant `setup/owner → login → me → refresh
  → logout`. Non bloquante en CI dans cet incrément (pas d'orchestration serveur
  ici) ; à promouvoir avec l'incrément conversations.
- `AGENTS.md` : tests verts + typecheck vert avant de considérer une tâche
  faite.

## 14. Alternatives considérées

| Sujet | Retenu | Écarté | Raison |
| ----- | ------ | ------ | ------ |
| Forme d'API | Client unique à namespaces | Fonctions plates ; classe par ressource exportée | Ergonomie consommateur, état de session porté par l'instance (overview) |
| Erreurs | Exceptions typées | Retour `Result` discriminé | Idiomatique TS/await ; `try/catch` unique côté consommateur (overview) |
| Couche HTTP | `fetch` + wrapper maison | `ky` / `axios` | `AGENTS.md` : pas de dépendance runtime lourde ; embeddable |
| Validation réponses | Types TS seuls | `zod` runtime | Poids ; double source de vérité avec `spec` |
| Config serveur | `server` + résolution discovery | `apiBaseUrl` explicite ; les deux | Découplage identité/hosting ([federation protocol](../../../docs/technical/federation-protocol.md)) ; une seule voie à tester |
| Version protocole | En-tête `X-Ekoz-Protocol` + garde discovery | Garde discovery seule ; constante non vérifiée | Prépare le serveur sans le bloquer ; échec net si incompatible (overview) |
| Persistance session | Adaptateur `SessionStore` injecté | SDK possède `localStorage` | Non disponible hors navigateur ; SDK multi-runtime (overview) |
| Notification rupture | Émetteur d'événements complet | Callback `onSessionInvalid` unique | Plusieurs consommateurs / plusieurs réactions (overview) |
| Concurrence refresh | Single-flight (promesse partagée) | File d'attente ; refresh naïf par requête | Évite N rotations concurrentes → fausse détection de réutilisation |
| Build | tsdown | tsup ; `bun build` + `tsc` | Aligné écosystème Vite/Rolldown de `client-web` ; dual ESM/CJS + types en une passe (overview) |
| Avatar | `Blob` / `File` | + fallback `{ data, type, filename }` | Natif navigateur/Bun/Node ≥ 20 ; suffisant pour les consommateurs actuels (overview) |
| Access token persisté | Non (mémoire seule) | Persister l'access token | Court (~15 min) ; re-frappé depuis le refresh au démarrage |

## 15. Conséquences vérifiées

- **Serveur sans lecteur de version** : `X-Ekoz-Protocol` est ignoré
  aujourd'hui (`grep` protocol → discovery seule). `docs/technical/` doit acter l'ajout
  d'un lecteur tolérant côté `server` ; sans lui l'en-tête reste informatif,
  sans régression.
- **Section protocole squelette** : les types du SDK sont dérivés du code
  serveur faute de spec détaillée. Obligation de contribuer la section identité
  à `spec` dans cet incrément (discipline [HTTP API conventions](../../../docs/technical/api-conventions.md)).
- **`register` sans tokens** : le flux d'inscription côté consommateur est
  `register` puis `login` (et, selon `registration.mode`, vérification e-mail
  entre les deux). À documenter dans le README du SDK et côté `client-web`
  (feature `auth`).
- **Dev local** : `bun link` exige un serveur de référence joignable servant sa
  discovery ; pas de mode « URL en dur » dans la config. Hook `resolveApiUrl`
  possible si le besoin se confirme (§4).
- **Consommateurs bloqués** :
  [`client-web`](https://github.com/marmotz/ekoz/blob/develop/apps/client-web/backlog/features/web-client-foundations/overview.md)
  (features `auth` / `profile`) et l'
  [admin console](https://github.com/marmotz/ekoz/blob/develop/backlog/features/admin-console/overview.md)
  consomment cette surface via link ; toute lacune se corrige ici.
- **Pas de SSE / pas de ticket de stream** ici, bien que
  `POST /stream/ticket` existe déjà côté serveur ; ils arrivent avec
  l'incrément conversations.
- **Changesets** : le `AGENTS.md` impose un changeset par changement visible dès
  maintenant, même sans publication — le `CHANGELOG.md` démarre avec le paquet.

## 16. À documenter dans `docs/technical/`

**0025 — SDK JS : packaging, distribution et politique de version de protocole.**
Contenu attendu :

- Forme de l'API (client unique à namespaces), erreurs en exceptions typées,
  `SessionStore` injecté, émetteur d'événements de cycle de vie.
- Sortie double ESM + CJS via tsdown ; distribution `link`-only jusqu'à
  stabilisation ; changesets activés, publication différée.
- En-tête `X-Ekoz-Protocol` sur chaque requête + garde de compatibilité contre
  `protocol_versions` de la discovery ; le serveur ajoute un lecteur tolérant
  (tâche `server`).
- Les types du SDK sont sourcés du code serveur tant que la section
  « Identity and profiles » du protocole n'est pas écrite ; cet incrément la
  rédige.

`0025` est le prochain numéro libre (`docs/technical/` s'arrête à `0024`).

## 17. Découpage en tâches d'implémentation

Dans l'ordre de dépendance (voir chaque fichier pour ses dépendances) :

1. [1-package-skeleton](../../tasks/done/sdk-1-package-skeleton.md) — squelette du paquet, tsdown, Vitest, ESLint, changesets, CI. `(done)`
2. [the SDK packaging and protocol-version policy design — packaging, distribution, politique de version de protocole](https://github.com/marmotz/ekoz/blob/develop/backlog/tasks/2-adr-0025-sdk-packaging.md) (docs task). `(done)`
3. [2-transport-core-and-errors](../../tasks/done/sdk-2-transport-core-and-errors.md) — `HttpClient`, `X-Request-Id`, décodage `problem+json`, hiérarchie d'erreurs typées. `(done)`
4. [3-discovery-and-protocol-guard](../../tasks/done/sdk-3-discovery-and-protocol-guard.md) — résolution `/.well-known/ekoz`, garde de version de protocole. `(done)`
5. [4-session-manager-and-store](../../tasks/20-session-manager-and-store.md) — cycle de vie tokens, refresh single-flight, `SessionStore`, émetteur d'événements. `#20`
6. [5-client-assembly-and-wire-types](../../tasks/21-client-assembly-and-wire-types.md) — types wire, `createClient`, assemblage des namespaces. `#21`
7. [6-auth-and-setup-resources](../../tasks/22-auth-and-setup-resources.md) — bindings `setup` et `auth`. `#22`
8. [7-profile-account-and-sessions-resources](../../tasks/23-profile-account-and-sessions-resources.md) — bindings `me`, `users`, `sessions`. `#23`
9. [8-invitations-and-admin-resources](../../tasks/24-invitations-and-admin-resources.md) — bindings `invitations` et `admin.*`. `#24`
10. [9-integration-test-suite](../../tasks/25-integration-test-suite.md) — suite d'intégration opt-in contre un serveur de référence. `#25`
11. [10-readme-and-usage-guide](../../tasks/26-readme-and-usage-guide.md) — README et guide d'usage. `#26`
12. [Section « Identity and profiles » du protocole](https://github.com/marmotz/ekoz/blob/develop/backlog/tasks/3-protocol-identity-section.md) (docs task). `#39`
