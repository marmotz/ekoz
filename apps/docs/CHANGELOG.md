# @ekozhq/docs

All notable changes to the documentation site.

## [Unreleased]

- Scaffold the documentation site: Docusaurus with three docs instances (guides, protocol, sdk), local search and a redirect from `/` to the guides. (#236)
- Write the Guides instance: quickstart, installation, deployment, configuration, operations, security and FAQ. (#237)
- Write the Protocol instance: overview, discovery, identity, rooms and permissions, messages, files and sharing, synchronisation, presence and typing, and changelog. Parse `.md` as CommonMark and fail the build on broken anchors. (#238)
- Write the SDK guide (introduction, quickstart, authentication and sessions, realtime) and generate the SDK API reference with TypeDoc into `sdk/api/` (git-ignored, regenerated on every build). (#239)
- Add the `docs.yml` workflow deploying the site to GitHub Pages on `develop` pushes, with the `ekoz.marmotz.dev` CNAME. (#240)
- Add `apps/docs` to the changelog gate (`scripts/check-changelog.sh`): `src/`, `docs/` and `sdk/` changes need an `[Unreleased]` entry. (#241)
- Run the dev and serve commands on port 6010 instead of 3000.
- Prefix the navbar version dropdowns with their instance name (Protocol, SDK) so the two "Next" entries are distinguishable.
- Publish `docs/protocol` directly as the Protocol instance (single source of truth) and delete the hand-adapted `apps/docs/protocol` copies; the protocol README is the overview at `/protocol/`. `docs/protocol` is cleaned of repository-internal references.
- Automate the SDK and Protocol docs versions: `bun run docs:version` freezes each instance when its released version has no snapshot yet (SDK by `major.minor` from `packages/sdk`, Protocol by major, or `0.minor` while at major 0, from `docs/protocol/CHANGELOG.md`), `bun run release:version` chains it after `changeset version`, and a test fails when a snapshot is missing.
