# Web client rooms

**Status**: technical design, see [technical.md](./technical.md)

## Context

Once a user can sign in ([`auth`](../auth/overview.md)), the demonstration client
needs to let them create and browse conversation rooms, the counterpart of the
shipped [conversations](../../_archives/features/conversations/overview.md) server feature.

Gaps found while scoping, against the current server and SDK:

- The server exposes no "my rooms" listing. Only the public
  [directory](../../../docs/protocol/rooms-and-permissions.md) and
  `GET /rooms/:id[/children]` exist, so a client cannot discover the rooms and
  spaces the user belongs to.
- The server exposes no listing of a user's pending invitations, nor of a room's
  pending join requests.
- A channel requires a parent space, and creating a root space is owner-only.
- `@ekozhq/sdk` has no rooms, membership or directory bindings yet.

## Goal

A signed-in user sees the rooms and spaces they belong to, can browse and join
public rooms, handle invitations and join requests for invite-only rooms, and can
create a space and a channel inside it (within their permissions), all against a
running reference server.

## Decisions made

- Lives in `src/features/rooms/{api,components,hooks,routes}` and registers its
  sidebar entry through the nav registry; all network access through
  [`@ekozhq/sdk`](../../_archives/features/sdk-foundations/overview.md).
- **Server listings added by this feature** (each with its protocol page, OpenAPI
  description and SDK bindings), rather than reconstructing state client-side:
  - `GET /rooms`: spaces and channels the caller is a member of.
  - `GET /me/room-invitations`: the caller's pending invitations (`GET /invitations`
    is already the owner-only registration invitations list).
  - a listing of a room's pending join requests, for users holding
    `room.manage_members`.
- **Sidebar**: a tree, each space a collapsible group holding its channels,
  mirroring the protocol hierarchy.
- **Direct conversations out of scope**: `dm` / `group_dm` are neither listed nor
  created here; a later feature covers them. The client ignores them if
  `GET /rooms` ever returns them.
- **Empty state**: a user with no space sees a welcome message pointing to the
  public directory. Creation actions appear only when the user's permissions allow
  them (root space is owner-only; otherwise a sub-space or a channel through
  `space.create_child`).
- **Creation form**: a single form, choosing the type (space or channel) and the
  parent, restricted to the parents where the user holds `space.create_child`.
- **Directory**: browse and search public channels, and join them.
- **Invite-only rooms**:
  - Pending invitations are shown to the invitee, who can accept or decline.
  - A non-member reaching an invite-only room through a direct link
    (`/rooms/:id`) gets a "request to join" screen, and a "request pending" state
    afterwards. Invite-only rooms are not discoverable through the directory.
  - Holders of `room.manage_members` get a minimal screen listing a room's pending
    join requests, with approve / reject. The flow is thus complete end to end in
    the client.
- Leaving a room is in scope; editing, moving, deleting a room, roles, bans and
  permission overrides are follow-ups.

## Settled in the technical design

- A minimal `GET /rooms/:id/preview` feeds the "request to join" screen (name,
  topic, state of the caller's request).
- Creating a room makes its creator a member.
- No live refresh yet: the room tree and invitations refetch on window focus and
  after each action; the stream belongs to
  [`web-client-chat`](../web-client-chat/overview.md).

## Dependencies

- [`auth`](../auth/overview.md): a signed-in session is required.
- [conversations](../../_archives/features/conversations/overview.md): server side; needs the new
  `GET /rooms`, `GET /invitations` and join-requests listing added to
  `apps/server`.
- SDK bindings for rooms, membership, invitations and directory in `packages/sdk`.

## Feature order

`auth` -> **web-client-rooms** -> [`web-client-chat`](../web-client-chat/overview.md).
