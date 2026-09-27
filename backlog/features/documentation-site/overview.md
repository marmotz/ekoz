# Documentation site

**Status**: technical design — see [technical.md](technical.md)

## Contexte

Ekoz n'a aujourd'hui qu'un `docs/` markdown brut (functional, protocol, technical),
pensé pour les contributeurs du repo, pas pour un lecteur externe (implémenteur du
protocole, consommateur du SDK, opérateur qui déploie son propre serveur). Il n'existe
aucun site publié, aucune référence API générée depuis le code, et aucun moyen de
consulter la doc d'une version passée du protocole ou du SDK.

## Objectif

Publier un site de documentation en ligne pour Ekoz couvrant trois axes :

- **Protocole** — spécification pour qui implémente un client ou un serveur tiers.
- **SDK** (`@ekozhq/sdk`) — guide d'usage + référence API générée depuis le code.
- **Installation et exploitation d'un serveur** — déploiement, configuration,
  opérations courantes.

Le protocole et le SDK évoluent chacun à leur rythme et doivent pouvoir être consultés
version par version (un client tiers fige la version du protocole qu'il implémente ;
un consommateur du SDK fige la version npm qu'il utilise). Les guides d'installation et
d'exploitation, eux, suivent toujours la dernière version — ils ne sont pas versionnés.

## Décisions actées

- **Outil** : Docusaurus (classic preset), pas Astro Starlight — Starlight n'a pas de
  système de versioning natif (seulement un plugin communautaire jeune, un seul axe à
  la fois), alors que le besoin ici est un versioning **multi-axes indépendants**
  (protocole ≠ SDK ≠ guides). Docusaurus le couvre nativement via le
  **multi-instance docs plugin** (une instance = un `routeBasePath`, un
  `versions.json`, un dropdown de version propres). Réutilise directement le savoir-faire
  déjà en place sur `kurotako/apps/docs` (config, plugin TypeDoc, recherche locale).
- **Emplacement** : nouveau workspace `apps/docs` (Bun workspace, comme `apps/admin`,
  `apps/client-web`, `apps/server`). Ne publie pas sur npm.
- **Structure en 3 instances de docs, un seul site** :
  - **Guides** (instance par défaut, **non versionnée**) : quickstart, installation,
    configuration serveur, exploitation (backup, monitoring, mise à jour), sécurité,
    FAQ.
  - **Protocol** (instance `protocol`, **versionnée**) : contenu repris/adapté de
    `docs/protocol/`. Un cut de version à chaque évolution notable, aligné sur
    `docs/protocol/CHANGELOG.md`.
  - **SDK** (instance `sdk`, **versionnée**) : guide d'usage + référence API générée
    par `docusaurus-plugin-typedoc` depuis `packages/sdk`. Un cut de version à chaque
    release npm publiée (Changesets).
- **Recherche** : recherche locale auto-hébergée (`@easyops-cn/docusaurus-search-local`),
  pas de service externe (pattern déjà utilisé sur Kurotako).
- **Contenu source** : le `docs/` markdown existant à la racine du repo reste la source
  de vérité pour les décisions techniques (`docs/technical/`) et les specs brutes
  (`docs/protocol/`, `docs/functional/`) ; `apps/docs` en tire une présentation publiée
  et versionnée, sans dupliquer le contenu — adapter/réorganiser au besoin pour un
  public externe plutôt que copier tel quel.

## À décider (technical.md)

- Cadence exacte des cuts de version (manuel vs scripté dans `scripts/release-publish.sh`).
- Hébergement / déploiement (cible : pages statiques, domaine à définir) et pipeline CI
  associé.
- Contenu précis de chaque page des guides (quickstart, sécurité, FAQ, etc. — pistes à
  affiner).
