<!-- backlog-sync 2026-09-20T15:09Z — GENERATED, do not hand-edit. Regenerate: skill backlog-sync -->

# Backlog

## Auth ·  [overview](features/auth/overview.md)

_[technical design](features/auth/technical.md)_ — 11/11 tasks done

| Done | Issue                                              | Title                                                                       | Blocked by              |
|------|----------------------------------------------------|-----------------------------------------------------------------------------|-------------------------|
| [x]  | [#90](https://github.com/marmotz/ekoz/issues/90)   | Auth server: public GET /auth/policy                                        | —                       |
| [x]  | [#91](https://github.com/marmotz/ekoz/issues/91)   | Auth SDK: auth.policy() binding                                             | #90                     |
| [x]  | [#92](https://github.com/marmotz/ekoz/issues/92)   | Auth client: route layouts (app shell vs auth pages), GuestOnly and UI base | —                       |
| [x]  | [#93](https://github.com/marmotz/ekoz/issues/93)   | Auth client: signed-in user menu with sign out                              | #92, #65                |
| [x]  | [#94](https://github.com/marmotz/ekoz/issues/94)   | Auth client: generated forms wiring, password input and error mapping       | #92                     |
| [x]  | [#95](https://github.com/marmotz/ekoz/issues/95)   | Auth client: check-email screen, resend verification and policy hook        | #91, #94                |
| [x]  | [#96](https://github.com/marmotz/ekoz/issues/96)   | Auth client: sign-in page                                                   | #94                     |
| [x]  | [#97](https://github.com/marmotz/ekoz/issues/97)   | Auth client: registration page (open, invite and admin modes)               | #94, #95                |
| [x]  | [#98](https://github.com/marmotz/ekoz/issues/98)   | Auth client: email verification page                                        | #94, #95                |
| [x]  | [#99](https://github.com/marmotz/ekoz/issues/99)   | Auth client: forgot and reset password pages                                | #94, #95                |
| [x]  | [#100](https://github.com/marmotz/ekoz/issues/100) | Document the web client auth design in docs/technical/                      | #96, #97, #98, #99, #93 |

## Identity and profiles ·  [overview](features/identity-and-profiles/overview.md)

_[technical design](features/identity-and-profiles/technical.md) (§1 to §20 server layer as shipped, §21 to §28 client
scope)_ — 9/9 tasks done

| Done | Issue                                              | Title                                                                                  | Blocked by               |
|------|----------------------------------------------------|----------------------------------------------------------------------------------------|--------------------------|
| [x]  | [#101](https://github.com/marmotz/ekoz/issues/101) | Identity server: POST /me/password to change the password                              | —                        |
| [x]  | [#102](https://github.com/marmotz/ekoz/issues/102) | Identity server: username change state, single pending request and cancellation        | —                        |
| [x]  | [#103](https://github.com/marmotz/ekoz/issues/103) | Identity server: pendingEmail in MeView and versioned avatarUrl                        | —                        |
| [x]  | [#104](https://github.com/marmotz/ekoz/issues/104) | Identity SDK: password, username state and avatar blob bindings                        | #101, #102, #103         |
| [x]  | [#105](https://github.com/marmotz/ekoz/issues/105) | Profile client: shared pieces (menu entries, avatar, UI base, generated hooks, errors) | #104, #65, #92, #93, #94 |
| [x]  | [#106](https://github.com/marmotz/ekoz/issues/106) | Profile client: /account route, profile and avatar sections                            | #105                     |
| [x]  | [#107](https://github.com/marmotz/ekoz/issues/107) | Profile client: identifier, email and password sections                                | #106                     |
| [x]  | [#108](https://github.com/marmotz/ekoz/issues/108) | Profile client: sessions and danger zone                                               | #106                     |
| [x]  | [#109](https://github.com/marmotz/ekoz/issues/109) | Profile docs: docs/technical/web-client-account.md                                     | #107, #108               |

## Web client chat ·  [overview](features/web-client-chat/overview.md)

_technical design, see [technical.md](features/web-client-chat/./technical.md)_ — 13/13 tasks done

| Done | Issue                                            | Title                                                                           | Blocked by         |
|------|--------------------------------------------------|---------------------------------------------------------------------------------|--------------------|
| [x]  | [#66](https://github.com/marmotz/ekoz/issues/66) | Web chat server: paginated GET /rooms/:id/messages                              | —                  |
| [x]  | [#67](https://github.com/marmotz/ekoz/issues/67) | Web chat server: GET /rooms/:id/members with effective members                  | —                  |
| [x]  | [#68](https://github.com/marmotz/ekoz/issues/68) | Web chat server: live edit and delete events (message_deleted)                  | —                  |
| [x]  | [#69](https://github.com/marmotz/ekoz/issues/69) | Web chat server: GET /events starts at the feed head without a cursor           | —                  |
| [x]  | [#70](https://github.com/marmotz/ekoz/issues/70) | Web chat server: feed fan-out to effective members                              | —                  |
| [x]  | [#71](https://github.com/marmotz/ekoz/issues/71) | Web chat SDK: messages, sync and rooms.members bindings, RoomEvent union        | #66, #67, #68      |
| [x]  | [#72](https://github.com/marmotz/ekoz/issues/72) | Web chat SDK: RoomStream (SSE with fresh-ticket reconnection)                   | #69, #71           |
| [x]  | [#73](https://github.com/marmotz/ekoz/issues/73) | Web chat client: shared/realtime (stream provider, subscriptions, unseen store) | #72                |
| [x]  | [#74](https://github.com/marmotz/ekoz/issues/74) | Web chat client: timeline reducer, queries and Markdown allow-list              | #71                |
| [x]  | [#75](https://github.com/marmotz/ekoz/issues/75) | Web chat client: history view, authors and route composition                    | #71, #74           |
| [x]  | [#76](https://github.com/marmotz/ekoz/issues/76) | Web chat client: live sync, reconnection catch-up and connection banner         | #68, #70, #73, #75 |
| [x]  | [#77](https://github.com/marmotz/ekoz/issues/77) | Web chat client: composer with optimistic send and read-only states             | #75                |
| [x]  | [#78](https://github.com/marmotz/ekoz/issues/78) | Web chat docs: docs/technical/web-client-chat.md                                | #75, #77, #76      |

## Web client rooms ·  [overview](features/web-client-rooms/overview.md)

_technical design, see [technical.md](features/web-client-rooms/./technical.md)_ — 7/15 tasks done

| Done | Issue                                            | Title                                                            | Blocked by              |
|------|--------------------------------------------------|------------------------------------------------------------------|-------------------------|
| [x]  | [#62](https://github.com/marmotz/ekoz/issues/62) | Conversations: creator becomes a member on room creation         | —                       |
| [x]  | [#63](https://github.com/marmotz/ekoz/issues/63) | Conversations: UserSummary and GET /me/room-invitations          | #103                    |
| [x]  | [#64](https://github.com/marmotz/ekoz/issues/64) | Conversations: GET /rooms/:id/preview for invite-only rooms      | —                       |
| [x]  | [#65](https://github.com/marmotz/ekoz/issues/65) | Client web: sidebar section slot and useMe                       | —                       |
| [x]  | [#79](https://github.com/marmotz/ekoz/issues/79) | Conversations: GET /rooms lists the caller's spaces and channels | #62                     |
| [x]  | [#80](https://github.com/marmotz/ekoz/issues/80) | Conversations: GET /rooms/:id/join-requests                      | #63                     |
| [x]  | [#81](https://github.com/marmotz/ekoz/issues/81) | SDK: rooms, room invitations and directory bindings              | #79, #63, #64, #80      |
| [ ]  | [#82](https://github.com/marmotz/ekoz/issues/82) | Client web rooms: data layer (queries, mutations, error mapping) | #81                     |
| [ ]  | [#83](https://github.com/marmotz/ekoz/issues/83) | Client web rooms: sidebar tree and /rooms route shell            | #65, #82                |
| [ ]  | [#84](https://github.com/marmotz/ekoz/issues/84) | Client web rooms: invitations page (accept / decline)            | #83, #82                |
| [ ]  | [#85](https://github.com/marmotz/ekoz/issues/85) | Client web rooms: RoomGate, RoomHeader and /rooms/$roomId        | #83, #82, #64           |
| [ ]  | [#86](https://github.com/marmotz/ekoz/issues/86) | Client web rooms: create a space or a channel                    | #83, #82                |
| [ ]  | [#87](https://github.com/marmotz/ekoz/issues/87) | Client web rooms: public directory (search and join)             | #83, #82                |
| [ ]  | [#88](https://github.com/marmotz/ekoz/issues/88) | Client web rooms: join request moderation screen                 | #85, #80                |
| [ ]  | [#89](https://github.com/marmotz/ekoz/issues/89) | Document the web client rooms design in docs/technical/          | #84, #85, #86, #87, #88 |
