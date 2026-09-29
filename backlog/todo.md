<!-- backlog-sync 2026-09-29T20:02Z — GENERATED, do not hand-edit. Regenerate: skill backlog-sync -->

# Backlog

## Web client room moderation ·  [overview](features/web-client-room-moderation/overview.md)

_designed, see [technical.md](./technical.md)_ — 0/10 tasks done

| Done | Issue                                              | Title                                                                                              | Blocked by             |
|------|----------------------------------------------------|----------------------------------------------------------------------------------------------------|------------------------|
| [ ]  | [#142](https://github.com/marmotz/ekoz/issues/142) | Moderation server: enforce bans in the resolver, cascade to descendants, Member.access             | —                      |
| [ ]  | [#151](https://github.com/marmotz/ekoz/issues/151) | Moderation server: problem+json extensions and room.banned with ban details                        | #142                   |
| [ ]  | [#159](https://github.com/marmotz/ekoz/issues/159) | Moderation server: role hierarchy, POST /rooms/:id/kicks with reason, member_removed account event | #142                   |
| [ ]  | [#160](https://github.com/marmotz/ekoz/issues/160) | Moderation server: required ban reason, internal note and GET /rooms/:id/bans                      | #159                   |
| [ ]  | [#161](https://github.com/marmotz/ekoz/issues/161) | Moderation server: invitation rules, liftBan, list and revoke room invitations                     | #159, #160             |
| [ ]  | [#162](https://github.com/marmotz/ekoz/issues/162) | Moderation SDK: rooms moderation bindings, error extensions and account event types                | #151, #159, #160, #161 |
| [ ]  | [#163](https://github.com/marmotz/ekoz/issues/163) | Moderation client: removed and banned screens, rooms account events                                | #162                   |
| [ ]  | [#164](https://github.com/marmotz/ekoz/issues/164) | Moderation client: member actions in the members panel (role, kick, ban)                           | #162, #126, #127       |
| [ ]  | [#167](https://github.com/marmotz/ekoz/issues/167) | Moderation client: invite, pending invitations and bans sections                                   | #164                   |
| [ ]  | [#170](https://github.com/marmotz/ekoz/issues/170) | Moderation docs: docs/technical/room-moderation.md                                                 | #163, #167             |

## Web client room settings ·  [overview](features/web-client-room-settings/overview.md)

_designed, see [technical.md](./technical.md)_ — 0/9 tasks done

| Done | Issue                                              | Title                                                                                          | Blocked by       |
|------|----------------------------------------------------|------------------------------------------------------------------------------------------------|------------------|
| [ ]  | [#198](https://github.com/marmotz/ekoz/issues/198) | Server: permission matrix read, override removal and lockout guard                             | —                |
| [ ]  | [#199](https://github.com/marmotz/ekoz/issues/199) | Server: directory.publish on visibility changes, move destination authority, retention minimum | —                |
| [ ]  | [#200](https://github.com/marmotz/ekoz/issues/200) | Docs: retention protocol page and room settings protocol changes                               | #198, #199       |
| [ ]  | [#201](https://github.com/marmotz/ekoz/issues/201) | SDK: room settings bindings (update, move, delete, retention, permission matrix)               | #198, #199       |
| [ ]  | [#202](https://github.com/marmotz/ekoz/issues/202) | Client: room settings route, header entry point and live room sync                             | #201             |
| [ ]  | [#203](https://github.com/marmotz/ekoz/issues/203) | Client: room settings General tab (details, visibility, move, delete)                          | #202             |
| [ ]  | [#204](https://github.com/marmotz/ekoz/issues/204) | Client: room settings Permissions tab (role x capability matrix)                               | #202, #198       |
| [ ]  | [#205](https://github.com/marmotz/ekoz/issues/205) | Client: room settings Retention tab                                                            | #202             |
| [ ]  | [#206](https://github.com/marmotz/ekoz/issues/206) | Docs: docs/technical/web-client-room-settings.md                                               | #203, #204, #205 |

## Web client timeline system events ·  [overview](features/web-client-timeline-system-events/overview.md)

_in discussion, technical design in [technical.md](./technical.md)_ — 0/4 tasks done

| Done | Issue                                              | Title                                                            | Blocked by |
|------|----------------------------------------------------|------------------------------------------------------------------|------------|
| [ ]  | [#186](https://github.com/marmotz/ekoz/issues/186) | Server: membership events and users in the room history page     | —          |
| [ ]  | [#187](https://github.com/marmotz/ekoz/issues/187) | SDK: typed membership events and history page events/users       | #186       |
| [ ]  | [#188](https://github.com/marmotz/ekoz/issues/188) | Web client: timeline events model, grouping and author directory | #187       |
| [ ]  | [#189](https://github.com/marmotz/ekoz/issues/189) | Web client: render system event lines and groups in the timeline | #188       |
