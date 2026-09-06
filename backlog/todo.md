# Backlog — delivery order

One backlog for the whole monorepo. Open work has a GitHub issue in
`marmotz/ekoz`; the file name is the issue number. Completed work is under
[`tasks/done/`](tasks/done/) (no issue — implemented before / during the
consolidation).

First product increment: **core + messaging + a minimal admin console** —
identity, basic administration, spaces/rooms/permissions, messages, presence,
retention, local moderation, exercised from the demonstration client.

Implement in dependency order; each task file has a `## Dependencies` section and
each issue body carries `Depends on #N` lines.

## Conversations

[Feature](features/conversations/overview.md) · [technical design](features/conversations/technical.md)

| Done | Issue                                            | Task                                                                                    | Description                                 |
|------|--------------------------------------------------|-----------------------------------------------------------------------------------------|---------------------------------------------|
| ☐   | [#1](https://github.com/marmotz/ekoz/issues/1)   | [1-conv-room-model-and-hierarchy](tasks/1-conv-room-model-and-hierarchy.md)             | Room model and hierarchy                    |
| ☐   | [#2](https://github.com/marmotz/ekoz/issues/2)   | [2-conv-event-log-and-seq](tasks/2-conv-event-log-and-seq.md)                           | Per-room event log and seq allocation       |
| ☐   | [#3](https://github.com/marmotz/ekoz/issues/3)   | [3-conv-permission-model](tasks/3-conv-permission-model.md)                             | Capability ACL and resolver                 |
| ☐   | [#4](https://github.com/marmotz/ekoz/issues/4)   | [4-conv-membership](tasks/4-conv-membership.md)                                         | Membership lifecycle                        |
| ☐   | [#5](https://github.com/marmotz/ekoz/issues/5)   | [5-conv-dm-and-group-dm](tasks/5-conv-dm-and-group-dm.md)                               | Direct and group conversations              |
| ☐   | [#6](https://github.com/marmotz/ekoz/issues/6)   | [6-conv-directory](tasks/6-conv-directory.md)                                           | Public room directory                       |
| ☐   | [#7](https://github.com/marmotz/ekoz/issues/7)   | [7-conv-messages](tasks/7-conv-messages.md)                                             | Messages, Markdown, mentions, replies, pins |
| ☐   | [#8](https://github.com/marmotz/ekoz/issues/8)   | [8-conv-message-edit-delete-tombstones](tasks/8-conv-message-edit-delete-tombstones.md) | Message edit, delete, tombstones            |
| ☐   | [#9](https://github.com/marmotz/ekoz/issues/9)   | [9-conv-reactions-and-read-markers](tasks/9-conv-reactions-and-read-markers.md)         | Reactions and read markers                  |
| ☐   | [#10](https://github.com/marmotz/ekoz/issues/10) | [10-conv-presence-and-typing](tasks/10-conv-presence-and-typing.md)                     | Presence and typing                         |
| ☐   | [#11](https://github.com/marmotz/ekoz/issues/11) | [11-conv-streaming-sync-and-feed](tasks/11-conv-streaming-sync-and-feed.md)             | Sync endpoint, account feed, SSE stream     |
| ☐   | [#12](https://github.com/marmotz/ekoz/issues/12) | [12-conv-retention](tasks/12-conv-retention.md)                                         | Retention policies and worker               |
| ☐   | [#13](https://github.com/marmotz/ekoz/issues/13) | [13-conv-local-moderation](tasks/13-conv-local-moderation.md)                           | Local moderation surface                    |
| ☐   | [#38](https://github.com/marmotz/ekoz/issues/38) | [38-conv-protocol-sections](tasks/38-conv-protocol-sections.md)                         | Protocol: conversations sections (`docs/`)  |

## SDK foundations

[Feature](features/sdk-foundations/overview.md) · [technical design](features/sdk-foundations/technical.md)

Done: package skeleton, transport core & errors, discovery & protocol guard ([`tasks/done/sdk-1..3`](tasks/done/)).

| Done | Issue                                            | Task                                                                                            | Description                                         |
|------|--------------------------------------------------|-------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| ☐   | [#20](https://github.com/marmotz/ekoz/issues/20) | [20-session-manager-and-store](tasks/20-session-manager-and-store.md)                           | Session manager, store adapter, lifecycle events    |
| ☐   | [#21](https://github.com/marmotz/ekoz/issues/21) | [21-client-assembly-and-wire-types](tasks/21-client-assembly-and-wire-types.md)                 | Client assembly and wire types                      |
| ☐   | [#22](https://github.com/marmotz/ekoz/issues/22) | [22-auth-and-setup-resources](tasks/22-auth-and-setup-resources.md)                             | Setup and auth resource bindings                    |
| ☐   | [#23](https://github.com/marmotz/ekoz/issues/23) | [23-profile-account-and-sessions-resources](tasks/23-profile-account-and-sessions-resources.md) | Profile, account and sessions bindings              |
| ☐   | [#24](https://github.com/marmotz/ekoz/issues/24) | [24-invitations-and-admin-resources](tasks/24-invitations-and-admin-resources.md)               | Invitations and admin resource bindings             |
| ☐   | [#25](https://github.com/marmotz/ekoz/issues/25) | [25-integration-test-suite](tasks/25-integration-test-suite.md)                                 | Opt-in integration test suite                       |
| ☐   | [#26](https://github.com/marmotz/ekoz/issues/26) | [26-readme-and-usage-guide](tasks/26-readme-and-usage-guide.md)                                 | README and usage guide                              |
| ☐   | [#27](https://github.com/marmotz/ekoz/issues/27) | [27-admin-console-bindings](tasks/27-admin-console-bindings.md)                                 | Admin console resource bindings                     |
| ☐   | [#39](https://github.com/marmotz/ekoz/issues/39) | [39-protocol-identity-section](tasks/39-protocol-identity-section.md)                           | Protocol: "Identity and profiles" section (`docs/`) |

## Server administration + admin console

[Feature](features/server-administration/overview.md) · [technical design](features/server-administration/technical.md)

The admin console (`apps/admin/`) consumes the server only through `@ekozhq/sdk`;
its bindings are [#27](https://github.com/marmotz/ekoz/issues/27) above.

| Done | Issue                                            | Task                                                                                              | Description                                         |
|------|--------------------------------------------------|---------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| ☐   | [#14](https://github.com/marmotz/ekoz/issues/14) | [14-admin-account-endpoints](tasks/14-admin-account-endpoints.md)                                 | Admin account read endpoints + owner password reset |
| ☐   | [#15](https://github.com/marmotz/ekoz/issues/15) | [15-console-reachability](tasks/15-console-reachability.md)                                       | Public setup-state probe + CORS                     |
| ☐   | [#16](https://github.com/marmotz/ekoz/issues/16) | [16-admin-console-bootstrap](tasks/16-admin-console-bootstrap.md)                                 | Admin console — application bootstrap               |
| ☐   | [#17](https://github.com/marmotz/ekoz/issues/17) | [17-admin-console-setup-and-auth](tasks/17-admin-console-setup-and-auth.md)                       | Admin console — server init + owner sign-in         |
| ☐   | [#18](https://github.com/marmotz/ekoz/issues/18) | [18-admin-console-accounts](tasks/18-admin-console-accounts.md)                                   | Admin console — account administration              |
| ☐   | [#19](https://github.com/marmotz/ekoz/issues/19) | [19-admin-console-invitations-and-usernames](tasks/19-admin-console-invitations-and-usernames.md) | Admin console — invitations + username requests     |

## Web client (demonstration)

[Feature](features/web-client-foundations/overview.md) · [technical design](features/web-client-foundations/technical.md) ·
sub-scopes: [auth](features/auth/overview.md), [profile](features/profile/overview.md)

> The task set below was written for a **TanStack Start** scaffold; the monorepo
> scaffold is plain **Vite + React**. [#37](https://github.com/marmotz/ekoz/issues/37)
> reconciles this first.

| Done | Issue                                            | Task                                                                    | Description                         |
|------|--------------------------------------------------|-------------------------------------------------------------------------|-------------------------------------|
| ☐   | [#28](https://github.com/marmotz/ekoz/issues/28) | [28-scaffold-tanstack-start](tasks/28-scaffold-tanstack-start.md)       | Scaffold the app                    |
| ☐   | [#29](https://github.com/marmotz/ekoz/issues/29) | [29-eslint-boundaries](tasks/29-eslint-boundaries.md)                   | Boundaries lint                     |
| ☐   | [#30](https://github.com/marmotz/ekoz/issues/30) | [30-shadcn-ui-base](tasks/30-shadcn-ui-base.md)                         | shadcn/ui base                      |
| ☐   | [#31](https://github.com/marmotz/ekoz/issues/31) | [31-tanstack-query-integration](tasks/31-tanstack-query-integration.md) | TanStack Query                      |
| ☐   | [#32](https://github.com/marmotz/ekoz/issues/32) | [32-theme-provider](tasks/32-theme-provider.md)                         | Theme light/dark/system             |
| ☐   | [#33](https://github.com/marmotz/ekoz/issues/33) | [33-i18n-react-i18next](tasks/33-i18n-react-i18next.md)                 | i18n                                |
| ☐   | [#34](https://github.com/marmotz/ekoz/issues/34) | [34-sdk-session-wiring](tasks/34-sdk-session-wiring.md)                 | SDK + session wiring                |
| ☐   | [#35](https://github.com/marmotz/ekoz/issues/35) | [35-app-shell-root-routes](tasks/35-app-shell-root-routes.md)           | App shell + routes                  |
| ☐   | [#36](https://github.com/marmotz/ekoz/issues/36) | [36-ci-workflow](tasks/36-ci-workflow.md)                               | CI workflow                         |
| ☐   | [#37](https://github.com/marmotz/ekoz/issues/37) | [37-web-client-bootstrap-doc](tasks/37-web-client-bootstrap-doc.md)     | Bootstrap doc + Vite/Start decision |

## Later features (overview only)

[Content and sharing](features/content-and-sharing/overview.md) ·
[Notifications](features/notifications/overview.md) ·
[Federation](features/federation/overview.md) ·
[Extensibility](features/extensibility/overview.md)

## Server OpenAPI documentation

[Feature](features/server-openapi-doc/overview.md) · [technical design](features/server-openapi-doc/technical.md)

| Done | Issue                                            | Task                                                                       | Description                                        |
|------|--------------------------------------------------|---------------------------------------------------------------------------|----------------------------------------------------|
| ☑   | [#43](https://github.com/marmotz/ekoz/issues/43) | [43-openapi-swagger-bootstrap](tasks/43-openapi-swagger-bootstrap.md)       | Swagger bootstrap + `nestjs-zod` bridge            |
| ☑   | [#44](https://github.com/marmotz/ekoz/issues/44) | [44-openapi-problem-details-dto](tasks/44-openapi-problem-details-dto.md)   | Shared problem+json schema + error decorator       |
| ☑   | [#45](https://github.com/marmotz/ekoz/issues/45) | [45-openapi-request-dtos](tasks/45-openapi-request-dtos.md)                 | Request DTOs to Zod DTO classes                    |
| ☑   | [#46](https://github.com/marmotz/ekoz/issues/46) | [46-openapi-response-schemas](tasks/46-openapi-response-schemas.md)         | Response schemas + view refactor                   |
| ☑   | [#47](https://github.com/marmotz/ekoz/issues/47) | [47-openapi-emit-script](tasks/47-openapi-emit-script.md)                   | Offline emit script + committed `openapi.json`     |
| ☐   | [#48](https://github.com/marmotz/ekoz/issues/48) | [48-openapi-ci-drift-check](tasks/48-openapi-ci-drift-check.md)             | Drift check via `tako check` in CI                 |
| ☑   | [#49](https://github.com/marmotz/ekoz/issues/49) | [49-openapi-design-doc-page](tasks/49-openapi-design-doc-page.md)           | Cross-cutting `docs/technical/` page               |

## Monorepo follow-ups

| Done | Issue                                            | Task                                                        | Description                                |
|------|--------------------------------------------------|-------------------------------------------------------------|--------------------------------------------|
| ☑   | [#40](https://github.com/marmotz/ekoz/issues/40) | [40-server-biome-cleanup](tasks/40-server-biome-cleanup.md) | Clear the server's advisory Biome warnings |
| ☑   | [#41](https://github.com/marmotz/ekoz/issues/41) | [41-verify-server-docker](tasks/41-verify-server-docker.md) | Verify the server Docker build             |
