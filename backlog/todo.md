<!-- backlog-sync 2026-09-26T20:28Z — GENERATED, do not hand-edit. Regenerate: skill backlog-sync -->

# Backlog

## Web client room moderation ·  [overview](features/web-client-room-moderation/overview.md)

_designed, see [technical.md](features/web-client-room-moderation/technical.md)_ — 0/10 tasks done

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

_designed, see [technical.md](features/web-client-room-settings/technical.md)_ — 0/9 tasks done

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

## Web client direct messages ·  [overview](features/web-client-direct-messages/overview.md)

_done, see [technical.md](features/web-client-direct-messages/technical.md)_ — 8/8 tasks done

| Done | Issue                                              | Title                                                                                       | Blocked by       |
|------|----------------------------------------------------|---------------------------------------------------------------------------------------------|------------------|
| [x]  | [#165](https://github.com/marmotz/ekoz/issues/165) | Conversations: per-member history floor and deleting a one-to-one conversation              | —                |
| [x]  | [#166](https://github.com/marmotz/ekoz/issues/166) | Conversations: contact search, profile id and active-user check on DM creation              | —                |
| [x]  | [#171](https://github.com/marmotz/ekoz/issues/171) | Conversations: GET /me/conversations lists the caller's direct and group conversations      | #165             |
| [x]  | [#172](https://github.com/marmotz/ekoz/issues/172) | Conversations: group admins, member management and group deletion                           | #165, #166       |
| [x]  | [#182](https://github.com/marmotz/ekoz/issues/182) | Conversations SDK: conversations resource and contact search                                | #166, #171, #172 |
| [x]  | [#183](https://github.com/marmotz/ekoz/issues/183) | Web client: conversations sidebar, conversation page and deleting a one-to-one conversation | #182             |
| [x]  | [#184](https://github.com/marmotz/ekoz/issues/184) | Web client: new conversation picker and StartConversationButton                             | #182, #183       |
| [x]  | [#185](https://github.com/marmotz/ekoz/issues/185) | Web client: group conversation settings (rename, members, admins, leave)                    | #183, #184       |

## Web client timeline system events ·  [overview](features/web-client-timeline-system-events/overview.md)

_in discussion, technical design in [technical.md](features/web-client-timeline-system-events/technical.md)_ — 0/4 tasks done

| Done | Issue                                              | Title                                                            | Blocked by |
|------|----------------------------------------------------|------------------------------------------------------------------|------------|
| [ ]  | [#186](https://github.com/marmotz/ekoz/issues/186) | Server: membership events and users in the room history page     | —          |
| [ ]  | [#187](https://github.com/marmotz/ekoz/issues/187) | SDK: typed membership events and history page events/users       | #186       |
| [ ]  | [#188](https://github.com/marmotz/ekoz/issues/188) | Web client: timeline events model, grouping and author directory | #187       |
| [ ]  | [#189](https://github.com/marmotz/ekoz/issues/189) | Web client: render system event lines and groups in the timeline | #188       |

## Content and sharing ·  [overview](features/content-and-sharing/overview.md)

_todo, see [technical.md](features/content-and-sharing/technical.md)_ — 0/21 tasks done

| Done | Issue                                              | Title                                                                                          | Blocked by                   |
|------|----------------------------------------------------|------------------------------------------------------------------------------------------------|------------------------------|
| [ ]  | [#136](https://github.com/marmotz/ekoz/issues/136) | Storage core: blob uploader, GC fix, content type sniffing and filtering                       | —                            |
| [ ]  | [#137](https://github.com/marmotz/ekoz/issues/137) | Storage core: S3-compatible storage driver                                                     | —                            |
| [ ]  | [#138](https://github.com/marmotz/ekoz/issues/138) | Storage core: per-user quota, global capacity and GET /me/storage                              | #136                         |
| [ ]  | [#139](https://github.com/marmotz/ekoz/issues/139) | Storage core: resumable uploads (tus 1.0) under /uploads                                       | #136, #138                   |
| [ ]  | [#140](https://github.com/marmotz/ekoz/issues/140) | Storage core: optional ffmpeg thumbnails and media metadata                                    | #139                         |
| [ ]  | [#141](https://github.com/marmotz/ekoz/issues/141) | Storage core: signed file URLs with per-request access check                                   | #136, #137                   |
| [ ]  | [#143](https://github.com/marmotz/ekoz/issues/143) | Conversations: room.attach and message attachments (send, edit, remove, redact, files listing) | #139, #141                   |
| [ ]  | [#144](https://github.com/marmotz/ekoz/issues/144) | Link previews: SSRF-safe fetcher, cache, POST /link-previews and message snapshot              | #140, #143                   |
| [ ]  | [#145](https://github.com/marmotz/ekoz/issues/145) | Admin settings API: GET/PUT/DELETE /admin/settings                                             | —                            |
| [ ]  | [#146](https://github.com/marmotz/ekoz/issues/146) | Admin storage endpoints: per-user quota, dashboard, file moderation                            | #138, #140, #144             |
| [ ]  | [#147](https://github.com/marmotz/ekoz/issues/147) | SDK: resumable upload client (client.uploads) and me.storage()                                 | #138, #139                   |
| [ ]  | [#148](https://github.com/marmotz/ekoz/issues/148) | SDK: message attachments, file URLs, room files and link previews                              | #143, #144                   |
| [ ]  | [#149](https://github.com/marmotz/ekoz/issues/149) | SDK: admin settings and storage bindings                                                       | #145, #146                   |
| [ ]  | [#150](https://github.com/marmotz/ekoz/issues/150) | Web client: render attachments in messages (signed URLs, grid, players, file card)             | #148                         |
| [ ]  | [#152](https://github.com/marmotz/ekoz/issues/152) | Web client: composer attachments (picker, drop, paste, tray, progress, optimistic send)        | #147, #150                   |
| [ ]  | [#153](https://github.com/marmotz/ekoz/issues/153) | Web client: link preview card in the composer and in messages                                  | #152                         |
| [ ]  | [#154](https://github.com/marmotz/ekoz/issues/154) | Web client: room Files panel and account storage section                                       | #147, #150                   |
| [ ]  | [#155](https://github.com/marmotz/ekoz/issues/155) | Web client: edit attachments and link preview in message edit mode                             | #152, #153                   |
| [ ]  | [#156](https://github.com/marmotz/ekoz/issues/156) | Admin console: sharing settings screen                                                         | #149                         |
| [ ]  | [#157](https://github.com/marmotz/ekoz/issues/157) | Admin console: storage dashboard, file moderation and user storage card                        | #149                         |
| [ ]  | [#158](https://github.com/marmotz/ekoz/issues/158) | Content and sharing docs: protocol and technical pages                                         | #137, #145, #146, #147, #148 |
