# Web client foundations — conception technique

**Statut** : en conception. Découle de [overview.md](./overview.md) (décisions
actées). Ne modifie aucun code pendant cette phase.

## 1. Périmètre

Bootstrap seul du client de démonstration. Livrable : une application
**TanStack Start** (React + Vite + runtime serveur Nitro) qui build, lint,
teste, se lance, affiche un shell applicatif (sidebar + topbar + bascule de
thème) et câble l'accès serveur via `sdk-js`. **Aucune** feature métier ici :
`auth` ([overview](../auth/overview.md)) et `profile`
([overview](../profile/overview.md)) sont des features séparées qui se branchent
sur ce socle.

Hors périmètre : toute route/écran métier, la persistance de session réelle
(seul l'adaptateur est fourni), les conversations, la présence, les
notifications, le partage.

Le dépôt est vide : `git ls-files` → `AGENTS.md`, `CHANGELOG.md`, `LICENSE`,
`NOTICE`. Tout le reste est créé par cet incrément.

### Références externes

- [ADR 0016](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0016-web-client-stack.md)
  — stack client web (React, Vite, TS, Tailwind 4, shadcn/ui, Bun, Vitest,
  TanStack Query, structure feature-first, i18n FR/EN). Ne mentionne pas
  TanStack Start : l'ADR de bootstrap (§14) l'ajoute.
- [ADR 0015](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0015-decisions-are-recorded-as-adrs.md)
  — toute décision → un ADR dans `spec`.
- [ADR 0014](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0014-changelog-discipline.md)
  — discipline `CHANGELOG.md`.
- [ADR 0006](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0006-federation-protocol.md)
  — découplage identité / hosting : le client vise un **domaine serveur**, l'URL
  d'API vient de la discovery.
- [ADR 0008](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0008-auth-and-sessions.md)
  — access JWT court + refresh rotatif : le cycle de vie tokens est **interne au
  SDK**, le client n'y touche pas.
- [SDK foundations — technical.md](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)
  — surface consommée : `createClient(config)`, `SessionStore`, émetteur
  d'événements `session:*`, classes d'erreur typées.
- Document de discovery `GET /.well-known/ekoz` :
  [discovery.service.ts:14](https://github.com/ekoz-chat/server/blob/main/src/core/discovery/discovery.service.ts#L14)
  (`{ server, api, web, protocol_versions, signing_keys }`).

## 2. Décisions prises dans cette phase (à acter en ADR)

| Sujet | Retenu | Raison |
| ----- | ------ | ------ |
| Socle | **TanStack Start** (embarque TanStack Router) | Décision utilisateur. Routing typé bout-en-bout, même écosystème que TanStack Query, `createServerFn` disponible si un besoin serveur émerge (proxy discovery, SSR de pages publiques), scaffold officiel `@tanstack/cli`. |
| Rendu | SSR + hydratation, streaming des loaders | Fourni par Start ; le shell et les pages publiques sont rendus côté serveur, l'app authentifiée s'hydrate côté client. |
| Runtime serveur | Nitro (sortie Node par défaut) | Sortie de build Start ; `node .output/server/index.mjs` en prod. Presets de déploiement disponibles mais non retenus dans cet incrément. |
| i18n | **react-i18next** | Standard de fait, détection de langue, interpolation/pluriels ICU, très documenté (ADR 0016 : « compréhensible par une majorité »). |
| Langue par défaut | Détection : `localStorage` puis en-tête `Accept-Language` côté serveur, **fallback `en`** ; choix persisté en `localStorage` (`ekoz.lang`) ; switcher dans la topbar | Client international ; détection SSR pour éviter le flash / mismatch d'hydratation. |
| Persistance de session | Adaptateur `SessionStore` → `localStorage` (clé `ekoz.session`), fourni par le client au SDK ; **le SDK ne tourne que côté client** | Le SDK est agnostique du stockage ([SDK technical §8](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)) ; `localStorage` absent au SSR → cf. §7. |
| Thème | `light` / `dark` / `system`, persisté `localStorage` (`ekoz.theme`), classe `dark` sur `<html>`, script inline anti-flash dans `<head>` | Convention Tailwind 4 / shadcn ; le script inline évite le flash au SSR. |
| Tests réseau | Le **SDK est mocké** dans les tests (module `@ekoz/sdk`), pas de MSW | Le client ne fait aucun `fetch` propre ; la frontière testable est l'API du SDK. |

## 3. Arborescence cible

```
client-web/
  package.json            # scripts: dev, build, start, typecheck, lint, test
  vite.config.ts          # plugins: tanstackStart(), viteReact(), tailwindcss(), tsconfigPaths()
  tsconfig.json           # paths: "@/*" -> src/*
  vitest.config.ts        # environment jsdom, setupFiles
  eslint.config.js        # flat config + eslint-plugin-boundaries
  .env.example            # VITE_EKOZ_SERVER=http://localhost:3001
  components.json         # config shadcn/ui (génération dans src/shared/ui)
  src/
    router.tsx            # createRouter(routeTree), context { queryClient, sdk }
    routeTree.gen.ts      # généré par le plugin TanStack Start
    styles/globals.css    # @import "tailwindcss"; @theme; tokens shadcn
    app/
      providers.tsx       # I18nextProvider, ThemeProvider, SdkProvider (côté client)
      query-client.ts     # createQueryClient() : NOUVELLE instance par requête SSR
      i18n.ts             # createI18n(lng) : instance i18next (SSR-safe, par requête)
      theme.tsx           # ThemeProvider + useTheme (light/dark/system)
      theme-script.ts     # chaîne du script inline anti-flash
    server/
      language.ts         # createServerFn : lit Accept-Language -> 'en' | 'fr'
    routes/
      __root.tsx          # <html><head><Meta/><Scripts/> ; <AppShell><Outlet/></AppShell>
      index.tsx           # écran d'accueil placeholder (statut serveur / discovery)
      login.tsx           # placeholder (remplacé par la feature auth)
    shared/
      sdk/
        client.ts         # createSdkClient() : createClient({ server, store })
        session-store.ts  # localStorageSessionStore() implémentant SessionStore
        provider.tsx      # SdkProvider + useSdk() (client-only, garde SSR)
        session.ts        # useSession() : état auth réactif via events session:*
        require-auth.tsx  # <RequireAuth> : redirige vers /login si anonyme
      ui/                 # composants shadcn/ui copiés (button, dropdown-menu, ...)
      layout/
        app-shell.tsx     # grille sidebar + topbar + zone contenu
        sidebar.tsx       # navigation (registre alimenté par les features)
        topbar.tsx        # titre, language-switcher, theme-toggle, user-menu (slot)
        nav-registry.ts   # tableau + registerNav()  (évite les imports croisés)
      i18n/
        locales/en/common.json
        locales/fr/common.json
        use-translation.ts  # ré-export typé de useTranslation
      lib/utils.ts        # cn() (clsx + tailwind-merge)
    features/             # VIDE dans cet incrément (auth/ et profile/ plus tard)
  test/
    setup.ts              # @testing-library/jest-dom, cleanup, mock matchMedia/localStorage
    render.tsx            # renderWithProviders()
    sdk-mock.ts           # faux client @ekoz/sdk
  .github/workflows/ci.yml
```

Règle feature-first ([ADR 0016](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0016-web-client-stack.md)) :
`src/features/<domain>/{api,components,hooks,routes}`, imports croisés entre
features interdits. `src/shared/**` importable par tous ; `src/app/**` et
`src/server/**` importés seulement par `router.tsx` / les routes.

## 4. Outillage et build

- **Bun** gestionnaire de paquets (`bun install`, `bun run`). Scaffold initial
  via `bunx @tanstack/cli@latest create` (template React + Vite), puis ajusté.
- **Vite** + plugin `@tanstack/react-start/plugin/vite` (`tanstackStart()`),
  `@vitejs/plugin-react`, `@tailwindcss/vite` (Tailwind 4, config CSS-first —
  pas de `tailwind.config.js`), `vite-tsconfig-paths`.
- **TypeScript** strict (`strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`). Alias `@/*` → `src/*`.
- `package.json` scripts :
  - `dev` : `vite dev`
  - `build` : `vite build` (produit `.output/` client + serveur Nitro)
  - `start` : `node .output/server/index.mjs`
  - `typecheck` : `tsc --noEmit` (couvert par le Stop hook)
  - `lint` : `eslint .`
  - `test` : `vitest run` ; `test:watch` : `vitest`
- `.env` : `VITE_EKOZ_SERVER` (domaine du serveur de référence, ex.
  `http://localhost:3001`). Exposée au navigateur via le préfixe `VITE_`.
  Aucune URL d'API en dur (résolue par discovery via le SDK).

## 5. Lint et frontières

- ESLint **flat config** (`eslint.config.js`) : `@eslint/js` recommended,
  `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`,
  et **`eslint-plugin-boundaries`**.
- Éléments `boundaries` :
  - `app` : `src/app/**`
  - `server` : `src/server/**`
  - `routes` : `src/routes/**`
  - `shared` : `src/shared/**`
  - `feature` : `src/features/*/**` (élément par dossier de premier niveau)
- Règles `boundaries/element-types` :
  - `feature` → autorisé : `shared`, sa **propre** `feature` ; interdit : autre
    `feature`, `app`, `server`, `routes`.
  - `shared` → autorisé : `shared` ; interdit : `feature`, `app`, `server`,
    `routes`.
  - `routes` → autorisé : `shared`, `feature`, `app`, `server`.
  - `app` / `server` → autorisé : `shared`, `app`, `server`.
- `boundaries/no-private`, `boundaries/no-unknown` activées. `routeTree.gen.ts`
  exclu du lint (`linguist-generated`). Une CI `lint` rend la violation
  bloquante.

## 6. Providers et SSR

Ordre de montage (dans `__root.tsx` et `router.tsx`) :

1. `router.tsx` : `createRouter({ routeTree, context: { queryClient, sdk: null } })`.
   Un `queryClient` **neuf par requête** (`createQueryClient()`) — pas de client
   module-level, sinon fuite d'état entre requêtes SSR. Intégration
   `setupRouterSsrQueryIntegration` (déshydratation/réhydratation du cache
   TanStack Query gérée par Start).
2. `__root.tsx` `component` : `<html>` / `<head>` avec `<Meta/>` + `<Scripts/>`,
   script inline de thème (§8), puis `providers.tsx` → `<AppShell><Outlet/>`.
3. `providers.tsx` (rendu serveur **et** client) : `I18nextProvider`
   (instance par requête, §9), `ThemeProvider`.
4. `SdkProvider` : **effet client uniquement**. Au SSR il fournit `sdk: null` et
   `useSession()` renvoie `status: 'unknown'` ; l'instance SDK est créée dans un
   `useEffect` au montage client (le SDK touche `localStorage` et n'a pas de
   sens côté serveur).

`createQueryClient()` — defaults : `staleTime` 30 s, `retry` = 1 sauf erreurs
`AuthenticationError` / `4xx` du SDK (pas de retry), `refetchOnWindowFocus`
false. `QueryCache.onError` global route les `AuthenticationError` non gérées
vers la déconnexion (§7).

## 7. Câblage SDK et session

- `shared/sdk/client.ts` : `createSdkClient()` appelle
  `createClient({ server: import.meta.env.VITE_EKOZ_SERVER, store: localStorageSessionStore() })`
  ([SDK technical §10](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)).
  **Appelé seulement côté client.**
- `shared/sdk/session-store.ts` : `localStorageSessionStore()` implémente
  `SessionStore` (`load` / `save` / `clear`) sur la clé `ekoz.session`,
  tolérant à un `localStorage` indisponible ou à un JSON corrompu (→ `null`).
- `shared/sdk/provider.tsx` : `SdkProvider` crée le client dans un `useEffect`
  (montage unique), appelle `sdk.session.resume()` si le store contient un
  refresh token ([SDK technical §7](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)),
  puis expose `{ sdk }` via contexte.
- `shared/sdk/session.ts` : `useSession()` expose
  `{ status: 'unknown' | 'authenticated' | 'anonymous', identifier, sessionId }`.
  `unknown` tant que le SDK n'est pas monté (inclut tout le SSR). Ensuite :
  `sdk.session.getState()` + abonnement aux événements `session:authenticated` /
  `session:refreshed` / `session:invalid` / `session:cleared`
  ([SDK technical §9](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)).
  Sur `session:invalid` : `queryClient.clear()` + `router.navigate({ to: '/login' })`.
- `shared/sdk/require-auth.tsx` : `<RequireAuth>` rend un `Skeleton` tant que
  `status === 'unknown'`, redirige vers `/login` si `anonymous`, rend ses
  enfants si `authenticated`. Réutilisé par `profile`.
- Le bootstrap **n'implémente pas** de garde métier au niveau loader ; les
  routes protégées de `profile` envelopperont leur composant dans `RequireAuth`
  (pas de `beforeLoad` serveur, la session vit côté client).
- Option non retenue ici : proxifier la discovery / porter la session en cookie
  httpOnly via `createServerFn`. Reléguée à un ADR ultérieur si un besoin réel
  apparaît (le SDK gère aujourd'hui le refresh rotatif en mémoire + store).
- Distribution SDK : `bun link @ekoz/sdk` depuis le checkout voisin
  ([overview](./overview.md)). `package.json` liste `@ekoz/sdk` sans version
  figée tant que non publié ; documenté dans le README. Le SDK doit rester
  importable sans casser le bundle serveur Nitro (import dynamique côté client
  si besoin).

## 8. Shell applicatif (sidebar + topbar + thème)

- `app-shell.tsx` : grille CSS — sidebar largeur fixe (repliable en < md via un
  `Sheet` shadcn), topbar collante, `<main>` scrollable rendant l'`<Outlet/>`.
- `sidebar.tsx` : les entrées de navigation viennent d'un registre
  `shared/layout/nav-registry.ts` (tableau + `registerNav()`) alimenté par
  chaque feature depuis son point d'entrée — les features n'importent jamais le
  code du shell directement (imports croisés interdits). Dans cet incrément le
  registre ne contient que « Home ».
- `topbar.tsx` : titre de page (via `useMatches()` + `staticData.title`),
  `LanguageSwitcher` (fr/en), `ThemeToggle` (light/dark/system), slot
  `user-menu` vide (rempli par `profile`).
- `theme.tsx` : `ThemeProvider` lit `ekoz.theme`, applique/retire `.dark` sur
  `<html>`, écoute `matchMedia('(prefers-color-scheme: dark)')` en mode
  `system`. `theme-script.ts` : chaîne injectée en tête de `<head>` dans
  `__root.tsx` pour poser la classe avant le premier paint (anti-flash SSR).
- Composants shadcn/ui copiés dans `shared/ui/` : `button`, `dropdown-menu`,
  `sheet`, `avatar`, `sonner`, `skeleton`. `components.json` pointe
  `src/shared/ui`.
- Tokens de thème dans `styles/globals.css` (`@theme` Tailwind 4 + variables
  CSS shadcn pour `:root` et `.dark`).

## 9. i18n

- `app/i18n.ts` : `createI18n(lng)` retourne une **instance i18next par
  requête** (`i18next.createInstance()`) + `react-i18next`, pour éviter le
  partage d'état de langue entre requêtes SSR. Config : `supportedLngs:
  ['en', 'fr']`, `fallbackLng: 'en'`, `resources` chargées statiquement.
- Détection de langue :
  - SSR : `server/language.ts` (`createServerFn`) lit l'en-tête
    `Accept-Language`, renvoie `'en' | 'fr'`. Appelée dans le `loader` de
    `__root.tsx`, la langue passe en `loaderData` → `createI18n(lng)` côté
    serveur et côté hydratation (même valeur, pas de mismatch).
  - Client : après hydratation, si `localStorage.ekoz.lang` diffère, on
    `i18n.changeLanguage(...)`.
- `<html lang>` posé depuis la langue du loader racine.
- Namespace par défaut `common` (`shared/i18n/locales/<lng>/common.json`) ;
  chaque feature ajoutera son namespace via `i18n.addResourceBundle`.
- `shared/i18n/use-translation.ts` : ré-export de `useTranslation` avec le type
  des clés dérivé de `en/common.json` (module augmentation `react-i18next`
  `CustomTypeOptions`) → autocomplétion + check des clés au typecheck.

## 10. Tests

- **Vitest** + `environment: 'jsdom'`, `test/setup.ts` :
  `@testing-library/jest-dom`, `cleanup()` auto, polyfill `matchMedia`,
  `localStorage` réinitialisé entre tests.
- `test/render.tsx` : `renderWithProviders(ui, { route })` monte un
  `QueryClient` neuf (retry off), l'`I18nextProvider` (instance de test), le
  `ThemeProvider`, et un routeur mémoire TanStack Router.
- `test/sdk-mock.ts` : `vi.mock('@ekoz/sdk')` — faux client avec
  `session.getState`, `on`/`off`, namespaces à la demande.
- Couverture visée par le bootstrap :
  - `localStorageSessionStore` : round-trip, storage absent, JSON corrompu.
  - `useSession` : `unknown` → `authenticated` sur `session:authenticated` ;
    `session:invalid` → `anonymous` + `queryClient.clear()` + navigation
    `/login`.
  - `SdkProvider` : ne crée pas de client au rendu serveur (`sdk` reste `null`,
    aucun accès `localStorage`) ; le crée au montage client.
  - `ThemeProvider` : applique/retire `.dark`, réagit à `prefers-color-scheme`
    en `system`, persiste ; le script inline pose la bonne classe.
  - `LanguageSwitcher` : change la langue, persiste, met à jour `<html lang>`.
  - `server/language.ts` : `Accept-Language: fr` → `'fr'` ; inconnu → `'en'`.
  - `AppShell` : rend l'outlet, replie la sidebar sous le breakpoint.
  - `RequireAuth` : skeleton en `unknown`, redirige les `anonymous`, rend les
    enfants en `authenticated`.
- `AGENTS.md` : tests + typecheck + lint verts avant qu'une tâche soit close ;
  entrée `CHANGELOG.md` sous `## [Unreleased]` dès que `src/` change (check CI).

## 11. CI

Workflow GitHub Actions (`.github/workflows/ci.yml`) : `bun install`,
`bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`, et un
check « entrée CHANGELOG présente si `src/` modifié » (
[ADR 0014](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0014-changelog-discipline.md)).
Le SDK n'étant pas publié, la CI le récupère depuis un checkout voisin du dépôt
`sdk-js` (`actions/checkout` + `bun link`) ou un tarball ; à trancher à
l'implémentation de la tâche CI. Pas de job de déploiement dans cet incrément.

## 12. Alternatives considérées

| Sujet | Retenu | Écarté | Raison |
| ----- | ------ | ------ | ------ |
| Socle | TanStack Start | Vite SPA + TanStack Router nu ; React Router ; Next.js | Décision utilisateur. Même API de routing qu'un Router nu + `createServerFn` disponible ; le surcoût (runtime serveur, hydratation) est accepté et acté en ADR. Vite SPA reste le repli si le runtime serveur pose problème. |
| Rendu | SSR + hydratation | SPA statique | Vient avec Start ; utile pour les pages publiques et l'anti-flash i18n/thème |
| Exécution du SDK | Client uniquement | Aussi côté serveur (server functions) | Le SDK stocke la session dans `localStorage` (indispo au SSR) et gère le refresh en mémoire ; le passer au serveur imposerait un modèle cookie httpOnly non requis ici |
| i18n | react-i18next (instance par requête) | @lingui ; provider maison | Standard répandu, détection + ICU inclus ; instance par requête = SSR-safe |
| Détection de langue | `localStorage` + `Accept-Language` (server fn) | Navigator seul (client) | Évite le flash et le mismatch d'hydratation |
| Chargement des catalogues | Statique dans le bundle | Lazy `import()` par langue | Deux petits catalogues ; lazy plus tard si le volume le justifie |
| Persistance session | `localStorage` via adaptateur SDK | `sessionStorage` ; cookie httpOnly | Persistance entre onglets/redémarrages pour une démo ; le SDK ne persiste jamais l'access token |
| Navigation des features | Registre `registerNav()` alimenté par chaque feature | Liste centralisée éditée à la main | Respecte l'interdiction d'imports croisés entre features |
| Mock réseau en test | Mock du module `@ekoz/sdk` | MSW | Le client ne fait aucun `fetch` propre ; la frontière utile est l'API SDK |
| shadcn/ui | Composants copiés dans `shared/ui` | Radix nu ; autre lib | Décision ADR 0016 ; possédés et éditables |

## 13. Conséquences vérifiées

- **Dépôt vide** : aucun code à migrer ; l'incrément pose toute la structure. Le
  `CHANGELOG.md` n'a qu'un `## [Unreleased]` vide — première entrée ajoutée par
  la première tâche touchant `src/`.
- **Runtime serveur ajouté** : Start produit un serveur Nitro. Le déploiement
  passe d'« hébergement de fichiers statiques » à « process Node à faire
  tourner » (`node .output/server/index.mjs`). ADR 0016 ne prévoyait pas ce
  runtime : l'ADR de bootstrap (§14) doit l'acter explicitement.
- **Session côté client seulement** : au SSR, `useSession()` renvoie `unknown`
  et les écrans protégés affichent un skeleton avant hydratation. Pas de
  `beforeLoad` serveur qui lit la session. Conséquence acceptée pour une démo ;
  documentée pour la feature `profile`.
- **SDK non publié / non implémenté** : `@ekoz/sdk` est au stade conception
  ([SDK technical.md](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)).
  Le câblage §7 dépend de son API (`createClient`, `SessionStore`, events
  `session:*`) ; si elle bouge, `shared/sdk/**` suit. Une lacune SDK se corrige
  dans `sdk-js`, jamais contournée ici (ADR 0016). Le SDK devra aussi être
  compatible du bundling Nitro (pas d'API navigateur-only au niveau module —
  [SDK technical §10](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)
  le prévoit).
- **Discovery obligatoire** : `createClient` prend un domaine, pas une URL d'API
  ([SDK technical §4](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)).
  Dev local : serveur de référence joignable servant `GET /.well-known/ekoz`.
  `VITE_EKOZ_SERVER` par défaut `http://localhost:3001`
  ([.env.example](https://github.com/ekoz-chat/server/blob/main/.env.example)).
- **`register` ne renvoie pas de tokens**
  ([SDK technical §7](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)) :
  le shell doit tolérer un `status` `anonymous` prolongé (inscription →
  vérification e-mail → login) ; c'est le cas par défaut.
- **`routeTree.gen.ts` généré** : committé (recommandation TanStack), marqué
  `linguist-generated`, exclu d'ESLint.
- **Feature order** : `auth` et `profile` restent bloquées tant que ce bootstrap
  et les bindings identité du SDK ne sont pas livrés
  ([overview](./overview.md)).

## 14. ADR à écrire (dans `spec`)

**0026 — Bootstrap du client web : socle TanStack Start, routing, i18n, shell,
câblage session.**

`0026` est le prochain numéro libre : `docs/technical/adr/` s'arrête à `0024`,
et `0025` est réservé par
[SDK foundations](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md).
À confirmer à l'écriture (le premier des deux incréments livrés prend `0025`).

Contenu attendu :

- **TanStack Start** comme socle (SSR + hydratation, runtime serveur Nitro,
  sortie Node) — précision/évolution d'ADR 0016 qui ne mentionnait que « Vite ».
  Justifier : routing typé, `createServerFn` disponible, écosystème TanStack
  cohérent ; assumer le runtime serveur pour le déploiement.
- react-i18next, instance par requête, détection `localStorage` +
  `Accept-Language`, `fallbackLng: 'en'`, namespace par feature.
- Shell : sidebar repliable + topbar ; thème `light`/`dark`/`system` persisté +
  script anti-flash ; registre de navigation alimenté par les features (pas
  d'import croisé).
- Câblage session : SDK **client-only**, adaptateur `SessionStore` sur
  `localStorage`, réactivité via les événements `session:*`, `resume()` au
  montage, `RequireAuth` + `useSession()` fournis au reste de l'app ; pas de
  garde de session côté serveur dans cet incrément.
- `eslint-plugin-boundaries` : matrice `feature` / `shared` / `routes` / `app` /
  `server`.
- Tests : mock du module `@ekoz/sdk`, pas de MSW.

## 15. Découpage en tâches d'implémentation

| # | Tâche | Issue | Dépend de |
| - | ----- | ----- | --------- |
| 1 | [Scaffold TanStack Start](../../tasks/1-scaffold-tanstack-start.md) | [#1](https://github.com/ekoz-chat/client-web/issues/1) | — |
| 2 | [ESLint + eslint-plugin-boundaries](../../tasks/2-eslint-boundaries.md) | [#2](https://github.com/ekoz-chat/client-web/issues/2) | 1 |
| 3 | [shadcn/ui + composants de base](../../tasks/3-shadcn-ui-base.md) | [#3](https://github.com/ekoz-chat/client-web/issues/3) | 1 |
| 4 | [Intégration TanStack Query](../../tasks/4-tanstack-query-integration.md) | [#4](https://github.com/ekoz-chat/client-web/issues/4) | 1 |
| 5 | [Thème light/dark/system](../../tasks/5-theme-provider.md) | [#5](https://github.com/ekoz-chat/client-web/issues/5) | 1, 3 |
| 6 | [i18n react-i18next](../../tasks/6-i18n-react-i18next.md) | [#6](https://github.com/ekoz-chat/client-web/issues/6) | 1, 3 |
| 7 | [Câblage SDK et session](../../tasks/7-sdk-session-wiring.md) | [#7](https://github.com/ekoz-chat/client-web/issues/7) | 1, 4 |
| 8 | [Shell + root route + routes placeholder](../../tasks/8-app-shell-root-routes.md) | [#8](https://github.com/ekoz-chat/client-web/issues/8) | 3, 4, 5, 6, 7 |
| 9 | [CI GitHub Actions](../../tasks/9-ci-workflow.md) | [#9](https://github.com/ekoz-chat/client-web/issues/9) | 1, 2 |
| 10 | [ADR 0026 (dans `ekoz-chat/spec`)](../../tasks/10-adr-0026-web-client-bootstrap.md) | [#10](https://github.com/ekoz-chat/client-web/issues/10) | — |
