<!-- backlog-sync 2026-09-14T18:49Z — GENERATED, do not hand-edit. Regenerate: skill backlog-sync -->

# Backlog

## conversations ·  [overview](features/conversations/overview.md)

_[technical design](technical.md)_ — 14/14 tasks done

| Done | Issue                                            | Title                                                      | Blocked by |
|------|--------------------------------------------------|------------------------------------------------------------|------------|
| [x]  | [#1](https://github.com/marmotz/ekoz/issues/1)   | Conversations: room model and hierarchy                    | —          |
| [x]  | [#2](https://github.com/marmotz/ekoz/issues/2)   | Conversations: per-room event log and seq allocation       | #1         |
| [x]  | [#3](https://github.com/marmotz/ekoz/issues/3)   | Conversations: capability ACL and resolver                 | #1, #2     |
| [x]  | [#4](https://github.com/marmotz/ekoz/issues/4)   | Conversations: membership lifecycle                        | #1, #2, #3 |
| [x]  | [#5](https://github.com/marmotz/ekoz/issues/5)   | Conversations: direct and group conversations              | #1, #4     |
| [x]  | [#6](https://github.com/marmotz/ekoz/issues/6)   | Conversations: public room directory                       | #1, #3     |
| [x]  | [#7](https://github.com/marmotz/ekoz/issues/7)   | Conversations: messages, Markdown, mentions, replies, pins | #2, #3     |
| [x]  | [#8](https://github.com/marmotz/ekoz/issues/8)   | Conversations: message edit, delete, tombstones            | #7         |
| [x]  | [#9](https://github.com/marmotz/ekoz/issues/9)   | Conversations: reactions and read markers                  | #4, #7     |
| [x]  | [#11](https://github.com/marmotz/ekoz/issues/11) | Conversations: sync endpoint, account feed, SSE stream     | #2, #4     |
| [x]  | [#10](https://github.com/marmotz/ekoz/issues/10) | Conversations: presence and typing                         | #4, #11    |
| [x]  | [#12](https://github.com/marmotz/ekoz/issues/12) | Conversations: retention policies and worker               | #2, #3, #8 |
| [x]  | [#13](https://github.com/marmotz/ekoz/issues/13) | Conversations: local moderation surface                    | #4, #8     |
| [x]  | [#38](https://github.com/marmotz/ekoz/issues/38) | Protocol: conversations sections                           | #2, #3     |

## web-client-foundations ·  [overview](features/web-client-foundations/overview.md)

_technical design — see [technical.md](./technical.md)_ — 10/10 tasks done

| Done | Issue                                            | Title                                                | Blocked by              |
|------|--------------------------------------------------|------------------------------------------------------|-------------------------|
| [x]  | [#28](https://github.com/marmotz/ekoz/issues/28) | Scaffold TanStack Start                              | —                       |
| [x]  | [#29](https://github.com/marmotz/ekoz/issues/29) | ESLint flat config + eslint-plugin-boundaries        | #28                     |
| [x]  | [#30](https://github.com/marmotz/ekoz/issues/30) | Shadcn/ui + composants de base                       | #28                     |
| [x]  | [#31](https://github.com/marmotz/ekoz/issues/31) | Intégration TanStack Query (SSR)                     | #28                     |
| [x]  | [#32](https://github.com/marmotz/ekoz/issues/32) | Thème light/dark/system                              | #28, #30                |
| [x]  | [#33](https://github.com/marmotz/ekoz/issues/33) | I18n react-i18next (SSR-safe)                        | #28, #30                |
| [x]  | [#34](https://github.com/marmotz/ekoz/issues/34) | Câblage SDK et session                               | #28, #31                |
| [x]  | [#35](https://github.com/marmotz/ekoz/issues/35) | Shell applicatif + root route + routes placeholder   | #30, #31, #32, #33, #34 |
| [x]  | [#36](https://github.com/marmotz/ekoz/issues/36) | CI — workflow GitHub Actions                         | #28, #29                |
| [x]  | [#37](https://github.com/marmotz/ekoz/issues/37) | Document the web client bootstrap in docs/technical/ | #35                     |
