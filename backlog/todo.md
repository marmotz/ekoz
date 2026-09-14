<!-- backlog-sync 2026-09-12T20:54Z — GENERATED, do not hand-edit. Regenerate: skill backlog-sync -->

# Backlog

## Conversations ·  [overview](features/conversations/overview.md)

_[technical design](features/conversations/technical.md)_ — 0/14 tasks done

| Done | Issue                                            | Title                                                      | Blocked by                                                                                                                                     |
|------|--------------------------------------------------|------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| [ ]  | [#1](https://github.com/marmotz/ekoz/issues/1)   | Conversations: room model and hierarchy                    | —                                                                                                                                              |
| [ ]  | [#2](https://github.com/marmotz/ekoz/issues/2)   | Conversations: per-room event log and seq allocation       | [#1](https://github.com/marmotz/ekoz/issues/1)                                                                                                 |
| [ ]  | [#3](https://github.com/marmotz/ekoz/issues/3)   | Conversations: capability ACL and resolver                 | [#1](https://github.com/marmotz/ekoz/issues/1), [#2](https://github.com/marmotz/ekoz/issues/2)                                                 |
| [ ]  | [#4](https://github.com/marmotz/ekoz/issues/4)   | Conversations: membership lifecycle                        | [#1](https://github.com/marmotz/ekoz/issues/1), [#2](https://github.com/marmotz/ekoz/issues/2), [#3](https://github.com/marmotz/ekoz/issues/3) |
| [ ]  | [#5](https://github.com/marmotz/ekoz/issues/5)   | Conversations: direct and group conversations              | [#1](https://github.com/marmotz/ekoz/issues/1), [#4](https://github.com/marmotz/ekoz/issues/4)                                                 |
| [ ]  | [#6](https://github.com/marmotz/ekoz/issues/6)   | Conversations: public room directory                       | [#1](https://github.com/marmotz/ekoz/issues/1), [#3](https://github.com/marmotz/ekoz/issues/3)                                                 |
| [ ]  | [#7](https://github.com/marmotz/ekoz/issues/7)   | Conversations: messages, Markdown, mentions, replies, pins | [#2](https://github.com/marmotz/ekoz/issues/2), [#3](https://github.com/marmotz/ekoz/issues/3)                                                 |
| [ ]  | [#8](https://github.com/marmotz/ekoz/issues/8)   | Conversations: message edit, delete, tombstones            | [#7](https://github.com/marmotz/ekoz/issues/7)                                                                                                 |
| [ ]  | [#9](https://github.com/marmotz/ekoz/issues/9)   | Conversations: reactions and read markers                  | [#4](https://github.com/marmotz/ekoz/issues/4), [#7](https://github.com/marmotz/ekoz/issues/7)                                                 |
| [ ]  | [#11](https://github.com/marmotz/ekoz/issues/11) | Conversations: sync endpoint, account feed, SSE stream     | [#2](https://github.com/marmotz/ekoz/issues/2), [#4](https://github.com/marmotz/ekoz/issues/4)                                                 |
| [ ]  | [#10](https://github.com/marmotz/ekoz/issues/10) | Conversations: presence and typing                         | [#4](https://github.com/marmotz/ekoz/issues/4), [#11](https://github.com/marmotz/ekoz/issues/11)                                               |
| [ ]  | [#12](https://github.com/marmotz/ekoz/issues/12) | Conversations: retention policies and worker               | [#2](https://github.com/marmotz/ekoz/issues/2), [#3](https://github.com/marmotz/ekoz/issues/3), [#8](https://github.com/marmotz/ekoz/issues/8) |
| [ ]  | [#13](https://github.com/marmotz/ekoz/issues/13) | Conversations: local moderation surface                    | [#4](https://github.com/marmotz/ekoz/issues/4), [#8](https://github.com/marmotz/ekoz/issues/8)                                                 |
| [ ]  | [#38](https://github.com/marmotz/ekoz/issues/38) | Protocol: conversations sections                           | [#2](https://github.com/marmotz/ekoz/issues/2), [#3](https://github.com/marmotz/ekoz/issues/3)                                                 |

## SDK foundations ·  [overview](features/sdk-foundations/overview.md)

_technical design — see [technical.md](features/sdk-foundations/technical.md)_ — 9/9 tasks done

| Done | Issue                                            | Title                                               | Blocked by                                                                                                                                           |
|------|--------------------------------------------------|-----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| [x]  | [#20](https://github.com/marmotz/ekoz/issues/20) | Session manager, store adapter and lifecycle events | —                                                                                                                                                    |
| [x]  | [#21](https://github.com/marmotz/ekoz/issues/21) | Client assembly and wire types                      | [#20](https://github.com/marmotz/ekoz/issues/20)                                                                                                     |
| [x]  | [#22](https://github.com/marmotz/ekoz/issues/22) | Setup and auth resource bindings                    | [#21](https://github.com/marmotz/ekoz/issues/21)                                                                                                     |
| [x]  | [#23](https://github.com/marmotz/ekoz/issues/23) | Profile, account and sessions resource bindings     | [#21](https://github.com/marmotz/ekoz/issues/21), [#22](https://github.com/marmotz/ekoz/issues/22)                                                   |
| [x]  | [#24](https://github.com/marmotz/ekoz/issues/24) | Invitations and admin resource bindings             | [#21](https://github.com/marmotz/ekoz/issues/21), [#22](https://github.com/marmotz/ekoz/issues/22)                                                   |
| [x]  | [#25](https://github.com/marmotz/ekoz/issues/25) | Opt-in integration test suite                       | [#22](https://github.com/marmotz/ekoz/issues/22), [#23](https://github.com/marmotz/ekoz/issues/23), [#24](https://github.com/marmotz/ekoz/issues/24) |
| [x]  | [#26](https://github.com/marmotz/ekoz/issues/26) | README and usage guide                              | [#22](https://github.com/marmotz/ekoz/issues/22), [#23](https://github.com/marmotz/ekoz/issues/23), [#24](https://github.com/marmotz/ekoz/issues/24) |
| [x]  | [#27](https://github.com/marmotz/ekoz/issues/27) | Admin console resource bindings                     | [#24](https://github.com/marmotz/ekoz/issues/24), [#14](https://github.com/marmotz/ekoz/issues/14), [#15](https://github.com/marmotz/ekoz/issues/15)                                                                                                     |
| [x]  | [#39](https://github.com/marmotz/ekoz/issues/39) | Protocol: "Identity and profiles" section           | [#22](https://github.com/marmotz/ekoz/issues/22), [#23](https://github.com/marmotz/ekoz/issues/23), [#24](https://github.com/marmotz/ekoz/issues/24) |

## Server administration ·  [overview](features/server-administration/overview.md)

_technical design — see [technical.md](features/server-administration/technical.md)_ — 2/6 tasks done

| Done | Issue                                            | Title                                                           | Blocked by                                                                                         |
|------|--------------------------------------------------|-----------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| [x]  | [#14](https://github.com/marmotz/ekoz/issues/14) | Admin account read endpoints and owner-triggered password reset | —                                                                                                  |
| [x]  | [#15](https://github.com/marmotz/ekoz/issues/15) | Public setup-state probe and CORS support                       | —                                                                                                  |
| [ ]  | [#16](https://github.com/marmotz/ekoz/issues/16) | Admin console — application bootstrap                           | —                                                                                                  |
| [ ]  | [#17](https://github.com/marmotz/ekoz/issues/17) | Admin console — server initialization and owner sign-in         | [#15](https://github.com/marmotz/ekoz/issues/15), [#16](https://github.com/marmotz/ekoz/issues/16) |
| [ ]  | [#18](https://github.com/marmotz/ekoz/issues/18) | Admin console — account administration                          | [#14](https://github.com/marmotz/ekoz/issues/14), [#16](https://github.com/marmotz/ekoz/issues/16) |
| [ ]  | [#19](https://github.com/marmotz/ekoz/issues/19) | Admin console — invitations and username-change requests        | [#16](https://github.com/marmotz/ekoz/issues/16)                                                   |

## Server OpenAPI documentation ·  [overview](features/server-openapi-doc/overview.md)

_technical design — [technical.md](features/server-openapi-doc/technical.md)_ — 6/7 tasks done

| Done | Issue                                            | Title                                                            | Blocked by                                                                                         |
|------|--------------------------------------------------|------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| [ ]  | [#48](https://github.com/marmotz/ekoz/issues/48) | OpenAPI: drift check via tako check                              | [#47](https://github.com/marmotz/ekoz/issues/47)                                                   |
| [x]  | [#43](https://github.com/marmotz/ekoz/issues/43) | OpenAPI: swagger bootstrap and Zod bridge                        | —                                                                                                  |
| [x]  | [#44](https://github.com/marmotz/ekoz/issues/44) | OpenAPI: shared problem+json schema and error response decorator | [#43](https://github.com/marmotz/ekoz/issues/43)                                                   |
| [x]  | [#45](https://github.com/marmotz/ekoz/issues/45) | OpenAPI: convert request DTOs to Zod DTO classes                 | [#43](https://github.com/marmotz/ekoz/issues/43)                                                   |
| [x]  | [#46](https://github.com/marmotz/ekoz/issues/46) | OpenAPI: response schemas and view refactor                      | [#44](https://github.com/marmotz/ekoz/issues/44), [#45](https://github.com/marmotz/ekoz/issues/45) |
| [x]  | [#47](https://github.com/marmotz/ekoz/issues/47) | OpenAPI: offline emit script and committed openapi.json          | [#46](https://github.com/marmotz/ekoz/issues/46)                                                   |
| [x]  | [#49](https://github.com/marmotz/ekoz/issues/49) | OpenAPI: cross-cutting design page                               | [#47](https://github.com/marmotz/ekoz/issues/47)                                                   |

## Web client foundations ·  [overview](features/web-client-foundations/overview.md)

_technical design — see [technical.md](features/web-client-foundations/technical.md)_ — 0/10 tasks done

| Done | Issue                                            | Title                                                | Blocked by                                                                                                                                                                                                                                               |
|------|--------------------------------------------------|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [ ]  | [#28](https://github.com/marmotz/ekoz/issues/28) | Scaffold TanStack Start                              | —                                                                                                                                                                                                                                                        |
| [ ]  | [#29](https://github.com/marmotz/ekoz/issues/29) | ESLint flat config + eslint-plugin-boundaries        | [#28](https://github.com/marmotz/ekoz/issues/28)                                                                                                                                                                                                         |
| [ ]  | [#30](https://github.com/marmotz/ekoz/issues/30) | Shadcn/ui + composants de base                       | [#28](https://github.com/marmotz/ekoz/issues/28)                                                                                                                                                                                                         |
| [ ]  | [#31](https://github.com/marmotz/ekoz/issues/31) | Intégration TanStack Query (SSR)                     | [#28](https://github.com/marmotz/ekoz/issues/28)                                                                                                                                                                                                         |
| [ ]  | [#32](https://github.com/marmotz/ekoz/issues/32) | Thème light/dark/system                              | [#28](https://github.com/marmotz/ekoz/issues/28), [#30](https://github.com/marmotz/ekoz/issues/30)                                                                                                                                                       |
| [ ]  | [#33](https://github.com/marmotz/ekoz/issues/33) | I18n react-i18next (SSR-safe)                        | [#28](https://github.com/marmotz/ekoz/issues/28), [#30](https://github.com/marmotz/ekoz/issues/30)                                                                                                                                                       |
| [ ]  | [#34](https://github.com/marmotz/ekoz/issues/34) | Câblage SDK et session                               | [#28](https://github.com/marmotz/ekoz/issues/28), [#31](https://github.com/marmotz/ekoz/issues/31)                                                                                                                                                       |
| [ ]  | [#35](https://github.com/marmotz/ekoz/issues/35) | Shell applicatif + root route + routes placeholder   | [#30](https://github.com/marmotz/ekoz/issues/30), [#31](https://github.com/marmotz/ekoz/issues/31), [#32](https://github.com/marmotz/ekoz/issues/32), [#33](https://github.com/marmotz/ekoz/issues/33), [#34](https://github.com/marmotz/ekoz/issues/34) |
| [ ]  | [#36](https://github.com/marmotz/ekoz/issues/36) | CI — workflow GitHub Actions                         | [#28](https://github.com/marmotz/ekoz/issues/28), [#29](https://github.com/marmotz/ekoz/issues/29)                                                                                                                                                       |
| [ ]  | [#37](https://github.com/marmotz/ekoz/issues/37) | Document the web client bootstrap in docs/technical/ | [#35](https://github.com/marmotz/ekoz/issues/35)                                                                                                                                                                                                         |

## No feature

| Done | Issue                                            | Title                                             | Blocked by |
|------|--------------------------------------------------|---------------------------------------------------|------------|
| [x]  | [#40](https://github.com/marmotz/ekoz/issues/40) | Clear the server's advisory Biome warnings        | —          |
| [x]  | [#41](https://github.com/marmotz/ekoz/issues/41) | Verify the server Docker build under the monorepo | —          |
