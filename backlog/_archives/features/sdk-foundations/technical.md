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

- [federation protocol](../../../../docs/technical/federation-protocol.md)
  — découplage identité / hosting, discovery.
- [authentication and sessions](../../../../docs/technical/auth-and-sessions.md)
  — access JWT court + refresh opaque rotatif, denylist `sid`, ticket SSE.
- [web client stack](../../../../docs/technical/web-client-stack.md)
  — aucun client n'appelle `fetch` directement.
- [HTTP API conventions](../../../../docs/technical/api-conventions.md)
  — `application/problem+json`, `code` stable namespacé, `X-Request-Id`, `422 validation_failed`.
- [entity identifier format](../../../../docs/technical/entity-identifier-format.md)
  — identifiants ULID opaques.
- [identity account and token mechanics](../../../../docs/technical/identity-account-and-token-mechanics.md)
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
    generated/            # écrit par `tako generate` (§11) — non modifié à la main
      api/typescript/*.type.ts, aliases.ts, enums.ts, filters.ts, index.ts
    types/
      wire.ts             # ré-exports nommés depuis generated/, alignés protocole v0
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
    ([HTTP API conventions](../../../../docs/technical/api-conventions.md)).
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
[federation protocol](../../../../docs/technical/federation-protocol.md)).

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
  [HTTP API conventions](../../../../docs/technical/api-conventions.md) :
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
  soit l'endpoint (objectif [HTTP API conventions](../../../../docs/technical/api-conventions.md)).
- `requestId` renseigné depuis `problem.requestId` sinon depuis le
  `X-Request-Id` envoyé, pour la corrélation support.

## 7. Cycle de vie tokens et sessions — `SessionManager`

Modèle serveur :
[authentication and sessions](../../../../docs/technical/auth-and-sessions.md) +
[identity account and token mechanics](../../../../docs/technical/identity-account-and-token-mechanics.md).
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

Décision overview (amendement post server-openapi-doc) : les types de payloads
ne sont plus écrits à la main, ils sont générés par kurotako depuis
[`apps/server/openapi.json`](https://github.com/marmotz/ekoz/blob/develop/apps/server/openapi.json),
qui devient la source de vérité du contrat SDK. Seuls les **types** sont
générés — client HTTP, `SessionManager`, `SessionStore`, émetteur
d'événements et namespaces de ressources restent écrits à la main (§3–§10) et
consomment ces types.

### 11.1 Spike : ce qui a été vérifié

`bunx tako generate` a été exécuté (hors dépôt, dans un projet jetable) contre
le vrai `apps/server/openapi.json` avec `@kurotako/parser-openapi` (parser) et
`@kurotako/gen-typescript` (generator). Deux constats :

- **Bloquant initialement, corrigé côté kurotako et vérifié** : les versions
  npm de l'époque déclaraient `"@kurotako/ir"` sur une plage trop basse pour
  couvrir `@kurotako/ir@0.3.0` (celle qui introduit les kinds `array` et
  `map`, IR format `'4'`) — or ces deux paquets émettent déjà ces kinds :
  `DiscoveryDocumentDto.signing_keys` (`additionalProperties`, une map) et les
  réponses `200` de `GET /sessions`, `GET /invitations`,
  `GET /admin/username-requests` (`type: array` en racine) faisaient échouer
  `tako generate` avec `ir_invalid`. Cause racine : `bun.lock` du dépôt
  `kurotako` restait figé sur d'anciennes versions internes (`changeset
  version` ne rafraîchit jamais le lockfile) et `bun pm pack` résout
  `workspace:^` depuis ce lockfile, pas depuis les `package.json` à jour — deux
  vagues de patch ont été nécessaires (une pour `parser-openapi`/
  `gen-typescript`, une seconde pour `core`/`config`/`parser-prisma`/
  `gen-zod`/`gen-angular`/`cli`, tous touchés par le même lockfile périmé) en
  plus du correctif du workflow de release (`bun install` après `changeset
  version`). **Revérifié en rejouant le spike avec les versions
  définitivement publiées** (`@kurotako/parser-openapi@0.2.2`,
  `@kurotako/gen-typescript@0.3.2`, `kurotako@0.2.1`) : `tako generate`
  produit les 48 fichiers attendus, `signing_keys` en `Record<string,
  unknown>`, les trois endpoints de liste en `T[]`. **Plus de blocage sur
  cette tâche.**
- **Pas de blocage, mais un vrai contournement nécessaire** : `gen-typescript`
  n'a pas d'`optionsSchema` — aucun réglage possible — et émet pour **chaque**
  schéma OpenAPI 10 variantes façon Prisma : `XxxDto`, `XxxDeepDto`,
  `XxxCreateDto`, `XxxCreateDeepDto`, `XxxUpdateDto`, `XxxUpdateDeepDto`,
  `XxxWhereDto`, `XxxWhereDeepDto`, `XxxSelectDto`, `XxxSelectDeepDto` (visible
  sur `LoginResponseDtoDto`, `LoginResponseDtoWhereDto`, etc. dans le spike).
  Seule `XxxDto` (variante « full », plate) a un sens pour un payload HTTP ;
  les 9 autres n'ont pas d'équivalent protocole et sont ignorées. Autre
  artefact observé : le générateur suffixe systématiquement `Dto`, y compris
  quand le schéma OpenAPI s'appelle déjà `LoginResponseDto` → type généré
  `LoginResponseDtoDto`. `src/types/wire.ts` absorbe ce renommage (§11.3).
- Les réponses de type tableau sont correctement rendues en `T[]`
  (`SessionsController_list200ResponseJson = SessionViewDtoDto[]`, etc.) une
  fois l'IR à jour — confirmé dans le même spike après build local des paquets
  `kurotako` sur leur `ir@0.3.0` déjà en place.

### 11.2 Câblage `tako.config.ts`

Nouvelle source `api` à côté de la source `db` existante (Prisma → Zod, déjà
câblée mais pas encore reliée à un script — §17), et un nouvel `output`
restreint par générateur (`OutputOption.generators`, cf.
`CONFIG_TEMPLATE_MONOREPO` de `@kurotako/config`) :

```ts
import { typescriptGenerator } from '@kurotako/gen-typescript';
import { zodGenerator } from '@kurotako/gen-zod';
import { openapiParser } from '@kurotako/parser-openapi';
import { prismaParser } from '@kurotako/parser-prisma';
import { defineConfig } from 'kurotako';

export default defineConfig({
  sources: {
    db: {
      use: prismaParser,
      options: { schema: './apps/server/src/core/prisma/contract.prisma', version: 8 },
    },
    api: {
      use: openapiParser,
      options: { document: './apps/server/openapi.json' },
    },
  },
  generators: [
    { use: zodGenerator, namespaces: ['db'] },
    { use: typescriptGenerator, namespaces: ['api'] },
    { use: zodGenerator, namespaces: ['api'] },
  ],
  outputs: [
    { dir: './apps/server/src/generated', generators: ['zod'] },
    { dir: './packages/sdk/src/generated', generators: ['typescript', 'zod'] },
  ],
});
```

`namespaces` sur chaque générateur évite que `zodGenerator` voie la source
`api` (et inversement) ; `generators` sur chaque `output` évite qu'un output
reçoive la sortie de l'autre générateur — sans ces deux filtres, les deux
sources fusionneraient dans les deux dossiers de sortie. `zodGenerator` est
câblé deux fois (`db` → `apps/server/src/generated`, validation runtime
serveur ; `api` → `packages/sdk/src/generated`, validation de formulaire côté
client) : même générateur, deux sources, deux sorties distinctes, chacune
listée dans son propre `outputs[].generators`.

**Amendement (décision produit :
[server-administration/overview.md](https://github.com/marmotz/ekoz/blob/develop/backlog/features/server-administration/overview.md))** :
la source `api` gagne `zodGenerator` en plus de `typescriptGenerator`, pour que
les consommateurs du SDK (admin console en premier lieu, potentiellement
`client-web` ensuite) valident leurs formulaires avec les mêmes schémas Zod
que ceux dérivés du contrat serveur, au lieu d'en écrire une copie à la main.
`gen-zod` n'a pas besoin d'évolution pour ça : il sait déjà produire des
schémas Zod depuis n'importe quelle IR source, `api` comprise (le support des
types issus de `parser-openapi` — maps typées, objets `additionalProperties`
— a été livré côté kurotako pour l'incrément `parser-openapi`, issue
[marmotz/kurotako#135](https://github.com/marmotz/kurotako/issues/135)) ; il
s'agit uniquement d'étendre la config `namespaces`/`outputs` ci-dessus.
`src/types/wire.ts` (§11.3) gagne un ré-export équivalent côté Zod, avec le
même renommage de double suffixe que pour les types TypeScript (à vérifier au
spike de cette tâche : `gen-zod` peut suivre une convention de nommage
différente de `gen-typescript`).

**Dépendances racine** (`package.json`, à côté de `kurotako` /
`@kurotako/parser-prisma` / `@kurotako/gen-zod` déjà présents) :
`@kurotako/parser-openapi@^0.2.2` et `@kurotako/gen-typescript@^0.3.2` — les
premières versions publiées avec le correctif §11.1. Le `bun install` qui les
ajoute doit aussi rafraîchir les copies imbriquées de `@kurotako/core` /
`@kurotako/config` (déjà déclarées via `kurotako`, `@kurotako/parser-prisma`,
`@kurotako/gen-zod`) vers `^0.1.3`, elles aussi concernées par le même
correctif.

**Scripts** : aucun script `generate` / `check` n'existe encore à la racine
(`tako` n'apparaît que dans `tako.config.ts` et les devDependencies — la
source `db` est câblée mais jamais exécutée). Cette tâche introduit
`"generate": "bunx tako generate"` et `"check": "bunx tako check"` à la racine
— ils couvrent les deux sources (`db` et `api`), pas seulement celle ajoutée
ici. `ci.yml` `check` job : `bun run openapi:emit` (déjà présent, régénère
`apps/server/openapi.json`) puis `bun run check` (drift guard kurotako, couvre
maintenant Prisma→Zod et OpenAPI→TypeScript).

`packages/sdk/src/generated` est un artefact **committé** (même politique que
`apps/server/openapi.json` et — une fois exécuté — `apps/server/src/generated`) :
régénéré par `bun run generate`, vérifié par `bun run check` en CI.

### 11.3 `src/types/wire.ts`

Fine couche de ré-export au-dessus de `generated/api`, qui :

- ne réexporte que la variante plate (`XxxDto`), jamais
  `Deep/Create/Update/Where/Select` ;
- renomme le double suffixe (`LoginResponseDtoDto` → `LoginResponse`,
  `MeViewDtoDto` → `MeView`, etc.) ;
- réexporte les alias d'opération utiles (`aliases.ts` du générateur, ex.
  `SessionsController_list200ResponseJson`) sous les noms utilisés par les
  ressources (§10), par exemple `type SessionsListResponse = SessionView[]`.

C'est la seule pièce de mapping manuelle ; elle ne redéclare aucun champ.

### 11.4 Contrat et écarts

- Pas de validation runtime des réponses (pas de `zod` en dépendance : poids,
  et double source de vérité). Le SDK fait confiance au contrat ; un écart
  observé est un bug de contrat.
- `apps/server/openapi.json` (donc les types SDK) peut diverger de
  [`spec/docs/protocol/`](https://github.com/marmotz/ekoz/blob/develop/docs/protocol/README.md)
  (section « Identity and profiles » encore à l'état de squelette). Discipline
  [HTTP API conventions](../../../../docs/technical/api-conventions.md) /
  `AGENTS.md` inchangée : cet incrément doit **contribuer** cette section à
  `spec` (le wire contract identité + le namespace de `code`), pas se
  contenter de la déduire du code serveur. Tâche transverse (§17).
- Un décalage constaté entre le serveur et `spec` se corrige dans `spec`,
  jamais contourné ici — seul change le mécanisme qui garde les types SDK
  honnêtes (généré, plutôt qu'aligné à la main).

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
| Config serveur | `server` + résolution discovery | `apiBaseUrl` explicite ; les deux | Découplage identité/hosting ([federation protocol](../../../../docs/technical/federation-protocol.md)) ; une seule voie à tester |
| Version protocole | En-tête `X-Ekoz-Protocol` + garde discovery | Garde discovery seule ; constante non vérifiée | Prépare le serveur sans le bloquer ; échec net si incompatible (overview) |
| Persistance session | Adaptateur `SessionStore` injecté | SDK possède `localStorage` | Non disponible hors navigateur ; SDK multi-runtime (overview) |
| Notification rupture | Émetteur d'événements complet | Callback `onSessionInvalid` unique | Plusieurs consommateurs / plusieurs réactions (overview) |
| Concurrence refresh | Single-flight (promesse partagée) | File d'attente ; refresh naïf par requête | Évite N rotations concurrentes → fausse détection de réutilisation |
| Build | tsdown | tsup ; `bun build` + `tsc` | Aligné écosystème Vite/Rolldown de `client-web` ; dual ESM/CJS + types en une passe (overview) |
| Avatar | `Blob` / `File` | + fallback `{ data, type, filename }` | Natif navigateur/Bun/Node ≥ 20 ; suffisant pour les consommateurs actuels (overview) |
| Access token persisté | Non (mémoire seule) | Persister l'access token | Court (~15 min) ; re-frappé depuis le refresh au démarrage |
| Source des types wire | Générés par kurotako depuis `apps/server/openapi.json` | Écrits/alignés à la main sur `spec/docs/protocol/` (plan initial de cet incrément) | Une seule source vérifiable, cohérente avec le serveur ; disponible depuis que kurotako a un parser OpenAPI + generator TypeScript (overview) |
| Variantes `gen-typescript` consommées | `XxxDto` (plate) uniquement, renommée dans `wire.ts` | Les 10 variantes générées (Deep/Create/Update/Where/Select) | Aucune n'a de sens pour un payload HTTP ; pas d'option côté générateur pour les supprimer à la source (spike §11.1) |

## 15. Conséquences vérifiées

- **Serveur sans lecteur de version** : `X-Ekoz-Protocol` est ignoré
  aujourd'hui (`grep` protocol → discovery seule). `docs/technical/` doit acter l'ajout
  d'un lecteur tolérant côté `server` ; sans lui l'en-tête reste informatif,
  sans régression.
- **Section protocole squelette** : les types du SDK sont dérivés du code
  serveur (via `openapi.json`) faute de spec détaillée. Obligation de
  contribuer la section identité à `spec` dans cet incrément (discipline
  [HTTP API conventions](../../../../docs/technical/api-conventions.md)).
- **Tâche #21 débloquée** : le blocage kurotako (§11.1) est résolu et vérifié
  sur les versions publiées (`@kurotako/parser-openapi@0.2.2`,
  `@kurotako/gen-typescript@0.3.2`) — cette tâche peut démarrer son câblage
  `generated/` normalement.
- **Premier usage réel de `tako generate`/`tako check` dans ce dépôt** : la
  source `db` (Prisma → Zod) était câblée dans `tako.config.ts` mais jamais
  exécutée (pas de script, `apps/server/src/generated` n'existe pas encore).
  Cette tâche introduit les scripts `generate`/`check` et le job CI associé,
  qui couvriront donc aussi cette source existante.
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
- **Amendement post-clôture** : les tâches #20–#39 sont déjà livrées (`bun run
  generate` ne couvre aujourd'hui que `zodGenerator` sur `db` et
  `typescriptGenerator` sur `api`). L'extension de `zodGenerator` à `api`
  (§11.2) est donc une nouvelle tâche, pas une réouverture de #21 ; elle
  touche `tako.config.ts`, `src/types/wire.ts` et exige un changeset. Les
  écrans de l'admin console qui consomment ces schémas (#18, #19 côté
  `server-administration`) en dépendent.

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
- Les types du SDK sont générés par kurotako depuis `apps/server/openapi.json`
  (§11) tant que la section « Identity and profiles » du protocole n'est pas
  écrite ; cet incrément la rédige.

`0025` est le prochain numéro libre (`docs/technical/` s'arrête à `0024`).

## 17. Découpage en tâches d'implémentation

Dans l'ordre de dépendance (voir chaque fichier pour ses dépendances) :

1. Squelette du paquet, tsdown, Vitest, ESLint, changesets, CI. `(done, pré-migration github-only — pas d'issue)`
2. SDK packaging and protocol-version policy design — packaging, distribution, politique de version de protocole (docs task). `(done, pré-migration github-only — pas d'issue)`
3. `HttpClient`, `X-Request-Id`, décodage `problem+json`, hiérarchie d'erreurs typées. `(done, pré-migration github-only — pas d'issue)`
4. Résolution `/.well-known/ekoz`, garde de version de protocole. `(done, pré-migration github-only — pas d'issue)`
5. Cycle de vie tokens, refresh single-flight, `SessionStore`, émetteur d'événements. [#20](https://github.com/marmotz/ekoz/issues/20)
6. Types wire générés par kurotako (§11 — nouvelle source `api`, scripts `generate`/`check`, `wire.ts`), `createClient`, assemblage des namespaces. [#21](https://github.com/marmotz/ekoz/issues/21)
7. Bindings `setup` et `auth`. [#22](https://github.com/marmotz/ekoz/issues/22)
8. Bindings `me`, `users`, `sessions`. [#23](https://github.com/marmotz/ekoz/issues/23)
9. Bindings `invitations` et `admin.*`. [#24](https://github.com/marmotz/ekoz/issues/24)
10. Suite d'intégration opt-in contre un serveur de référence. [#25](https://github.com/marmotz/ekoz/issues/25)
11. README et guide d'usage. [#26](https://github.com/marmotz/ekoz/issues/26)
12. Section « Identity and profiles » du protocole (docs task). [#39](https://github.com/marmotz/ekoz/issues/39)
13. Extension de `zodGenerator` à la source `api` (§11.2, amendement), export
    des schémas de validation dans `wire.ts`. Débloque les écrans de formulaire
    de l'admin console (#18, #19). [#53](https://github.com/marmotz/ekoz/issues/53)
