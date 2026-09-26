<!-- backlog-sync 2026-09-25T14:34Z — GENERATED, do not hand-edit. Regenerate: skill backlog-sync -->

# Backlog

## Web client members ·  [overview](features/web-client-members/overview.md)

_done, see [technical.md](features/web-client-members/technical.md)_ — 6/6 tasks done

| Done | Issue                                              | Title                                                                   | Blocked by       |
|------|----------------------------------------------------|-------------------------------------------------------------------------|------------------|
| [x]  | [#123](https://github.com/marmotz/ekoz/issues/123) | Members server: GET /users?ids= user summaries by id                    | —                |
| [x]  | [#124](https://github.com/marmotz/ekoz/issues/124) | Members SDK: users.summaries(ids) binding                               | #123             |
| [x]  | [#125](https://github.com/marmotz/ekoz/issues/125) | Members client: shared members query, live refresh and authors who left | #124             |
| [x]  | [#126](https://github.com/marmotz/ekoz/issues/126) | Members client: public profile card from authors and the user menu      | #125             |
| [x]  | [#127](https://github.com/marmotz/ekoz/issues/127) | Members client: members panel, header toggle and route composition      | #125, #126       |
| [x]  | [#128](https://github.com/marmotz/ekoz/issues/128) | Members docs: docs/technical/web-client-members.md                      | #125, #126, #127 |

## Web client mentions ·  [overview](features/web-client-mentions/overview.md)

_done, see [technical.md](features/web-client-mentions/technical.md)_ — 11/11 tasks done

| Done | Issue                                              | Title                                                                               | Blocked by             |
|------|----------------------------------------------------|-------------------------------------------------------------------------------------|------------------------|
| [x]  | [#168](https://github.com/marmotz/ekoz/issues/168) | Mentions server: room groups, room.manage_groups and shared effective members query | —                      |
| [x]  | [#169](https://github.com/marmotz/ekoz/issues/169) | Mentions server: GET /rooms/:id/messages after and around                           | —                      |
| [x]  | [#173](https://github.com/marmotz/ekoz/issues/173) | Mentions server: mention targets, audience, edit and mentionsMe                     | #168                   |
| [x]  | [#174](https://github.com/marmotz/ekoz/issues/174) | Mentions server: unread mention counters and GET /me/mentions                       | #173                   |
| [x]  | [#175](https://github.com/marmotz/ekoz/issues/175) | Mentions SDK: mention targets, edit, after/around, mentions and groups resources    | #168, #173, #174, #169 |
| [x]  | [#176](https://github.com/marmotz/ekoz/issues/176) | Mentions client: mention chips, highlight, live mentionsMe and shared groups query  | #175, #125, #126       |
| [x]  | [#177](https://github.com/marmotz/ekoz/issues/177) | Mentions client: TipTap composer with @ suggestions                                 | #176                   |
| [x]  | [#178](https://github.com/marmotz/ekoz/issues/178) | Mentions client: room groups settings                                               | #176                   |
| [x]  | [#179](https://github.com/marmotz/ekoz/issues/179) | Mentions client: jump to a message and detached timeline                            | #175                   |
| [x]  | [#180](https://github.com/marmotz/ekoz/issues/180) | Mentions client: unread mention badges and My mentions page                         | #176, #179             |
| [x]  | [#181](https://github.com/marmotz/ekoz/issues/181) | Mentions docs: docs/technical/web-client-mentions.md                                | #177, #178, #180       |

## Web client composer formatting ·  [overview](features/web-client-composer-formatting/overview.md)

_done, see [technical.md](features/web-client-composer-formatting/technical.md)_ — 8/8 tasks done

| Done | Issue                                              | Title                                                                             | Blocked by                   |
|------|----------------------------------------------------|-----------------------------------------------------------------------------------|------------------------------|
| [x]  | [#190](https://github.com/marmotz/ekoz/issues/190) | Composer formatting server: public messages policy endpoint                       | —                            |
| [x]  | [#191](https://github.com/marmotz/ekoz/issues/191) | Composer formatting SDK: messages policy binding                                  | #190                         |
| [x]  | [#192](https://github.com/marmotz/ekoz/issues/192) | Composer formatting client: highlighted code blocks with label and copy           | #176                         |
| [x]  | [#193](https://github.com/marmotz/ekoz/issues/193) | Composer formatting client: editor extensions, Enter rules, toolbar and shortcuts | #177                         |
| [x]  | [#194](https://github.com/marmotz/ekoz/issues/194) | Composer formatting client: link popover and link rules                           | #193                         |
| [x]  | [#195](https://github.com/marmotz/ekoz/issues/195) | Composer formatting client: code block language selector                          | #193, #192                   |
| [x]  | [#196](https://github.com/marmotz/ekoz/issues/196) | Composer formatting client: message length counter                                | #193, #191                   |
| [x]  | [#197](https://github.com/marmotz/ekoz/issues/197) | Composer formatting docs: docs/technical/web-client-composer-formatting.md        | #192, #193, #194, #195, #196 |

## Web client message actions ·  [overview](features/web-client-message-actions/overview.md)

_done, see [technical.md](features/web-client-message-actions/technical.md)_ — 11/11 tasks done

| Done | Issue                                              | Title                                                                         | Blocked by                         |
|------|----------------------------------------------------|-------------------------------------------------------------------------------|------------------------------------|
| [x]  | [#207](https://github.com/marmotz/ekoz/issues/207) | Message actions server: reactions on Message and guards on redacted messages  | —                                  |
| [x]  | [#208](https://github.com/marmotz/ekoz/issues/208) | Message actions server: editWindow on the messages policy                     | —                                  |
| [x]  | [#209](https://github.com/marmotz/ekoz/issues/209) | Message actions server: pins embed the message                                | #207                               |
| [x]  | [#210](https://github.com/marmotz/ekoz/issues/210) | Message actions SDK: edit, delete, pins, reactions and typed events           | #207, #208, #209                   |
| [x]  | [#211](https://github.com/marmotz/ekoz/issues/211) | Message actions client: action availability, context menu and delete          | #210, #191, #208                   |
| [x]  | [#212](https://github.com/marmotz/ekoz/issues/212) | Message actions client: reactions state, chips and emoji picker               | #210, #211                         |
| [x]  | [#213](https://github.com/marmotz/ekoz/issues/213) | Message actions client: reply banner and quote                                | #210, #211                         |
| [x]  | [#214](https://github.com/marmotz/ekoz/issues/214) | Message actions client: pins query, indicator and panel                       | #209, #210, #211, #127             |
| [x]  | [#215](https://github.com/marmotz/ekoz/issues/215) | Message actions client: jump to the parent of a reply and to a pinned message | #213, #214, #179                   |
| [x]  | [#216](https://github.com/marmotz/ekoz/issues/216) | Message actions client: inline message edit                                   | #210, #211, #177                   |
| [x]  | [#217](https://github.com/marmotz/ekoz/issues/217) | Message actions docs: docs/technical/web-client-message-actions.md            | #211, #212, #213, #214, #215, #216 |

## Web client presence and typing ·  [overview](features/web-client-presence-and-typing/overview.md)

_done, see [technical.md](features/web-client-presence-and-typing/technical.md)_ — 7/7 tasks done

| Done | Issue                                              | Title                                                                                   | Blocked by       |
|------|----------------------------------------------------|-----------------------------------------------------------------------------------------|------------------|
| [x]  | [#129](https://github.com/marmotz/ekoz/issues/129) | Presence server: per-recipient delivery of presence and typing                          | —                |
| [x]  | [#130](https://github.com/marmotz/ekoz/issues/130) | Presence server: per-client state, emission on change, lapse sweep and connect snapshot | #129             |
| [x]  | [#131](https://github.com/marmotz/ekoz/issues/131) | Presence server: persisted manual away and heartbeat response settings                  | #130             |
| [x]  | [#132](https://github.com/marmotz/ekoz/issues/132) | Presence SDK: client.presence resource, heartbeat reporter and typing throttle          | #131             |
| [x]  | [#133](https://github.com/marmotz/ekoz/issues/133) | Presence client: own presence, presence store, avatar dot and appear-away toggle        | #132             |
| [x]  | [#134](https://github.com/marmotz/ekoz/issues/134) | Presence client: typing store, typing line and sidebar indicator                        | #132             |
| [x]  | [#135](https://github.com/marmotz/ekoz/issues/135) | Presence client: presence on members panel, profile card and direct conversations       | #133, #126, #127 |

## Web client read state ·  [overview](features/web-client-read-state/overview.md)

_done, see [technical.md](features/web-client-read-state/technical.md)_ — 8/8 tasks done

| Done | Issue                                              | Title                                                                    | Blocked by                   |
|------|----------------------------------------------------|--------------------------------------------------------------------------|------------------------------|
| [x]  | [#218](https://github.com/marmotz/ekoz/issues/218) | Read state server: read markers for effective members                    | —                            |
| [x]  | [#219](https://github.com/marmotz/ekoz/issues/219) | Read state server: unreadCount on GET /rooms                             | #218                         |
| [x]  | [#220](https://github.com/marmotz/ekoz/issues/220) | Read state SDK: receipts resource, receipt_updated event and unreadCount | #218, #219                   |
| [x]  | [#221](https://github.com/marmotz/ekoz/issues/221) | Read state client: replace the unseen store with active and reading room | —                            |
| [x]  | [#222](https://github.com/marmotz/ekoz/issues/222) | Read state client: send the read marker while reading                    | #220, #221                   |
| [x]  | [#223](https://github.com/marmotz/ekoz/issues/223) | Read state client: unread badges and live rooms list                     | #220, #221                   |
| [x]  | [#224](https://github.com/marmotz/ekoz/issues/224) | Read state client: read receipt avatars under messages                   | #220                         |
| [x]  | [#225](https://github.com/marmotz/ekoz/issues/225) | Read state docs: docs/technical/web-client-read-state.md                 | #218, #219, #222, #223, #224 |

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

_technical design, see [technical.md](features/web-client-direct-messages/technical.md)_ — 0/8 tasks done

| Done | Issue                                              | Title                                                                                       | Blocked by       |
|------|----------------------------------------------------|---------------------------------------------------------------------------------------------|------------------|
| [ ]  | [#165](https://github.com/marmotz/ekoz/issues/165) | Conversations: per-member history floor and deleting a one-to-one conversation              | —                |
| [ ]  | [#166](https://github.com/marmotz/ekoz/issues/166) | Conversations: contact search, profile id and active-user check on DM creation              | —                |
| [ ]  | [#171](https://github.com/marmotz/ekoz/issues/171) | Conversations: GET /me/conversations lists the caller's direct and group conversations      | #165             |
| [ ]  | [#172](https://github.com/marmotz/ekoz/issues/172) | Conversations: group admins, member management and group deletion                           | #165, #166       |
| [ ]  | [#182](https://github.com/marmotz/ekoz/issues/182) | Conversations SDK: conversations resource and contact search                                | #166, #171, #172 |
| [ ]  | [#183](https://github.com/marmotz/ekoz/issues/183) | Web client: conversations sidebar, conversation page and deleting a one-to-one conversation | #182             |
| [ ]  | [#184](https://github.com/marmotz/ekoz/issues/184) | Web client: new conversation picker and StartConversationButton                             | #182, #183       |
| [ ]  | [#185](https://github.com/marmotz/ekoz/issues/185) | Web client: group conversation settings (rename, members, admins, leave)                    | #183, #184       |

## Web client timeline system events ·  [overview](features/web-client-timeline-system-events/overview.md)

_in discussion, technical design in [technical.md](features/web-client-timeline-system-events/technical.md)_ — 0/4 tasks
done

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
