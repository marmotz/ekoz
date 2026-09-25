# Web client room moderation

**Status**: designed, see [technical.md](./technical.md)

## Context

Moderators can remove or ban a member, administrators can change a member's
role, and holders of `room.invite` can invite users
(`DELETE /rooms/:id/members/:userId`, `POST /rooms/:id/bans`,
`PATCH /rooms/:id/members/:userId`, `POST /rooms/:id/invitations`), see
[rooms and permissions](../../../docs/protocol/rooms-and-permissions.md#membership).
[`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md) only covers the invitee side
and join request approval; sending invitations, roles and bans were left out.

The current protocol does not let a client do this end to end:

- inviting takes a `userId`, but nothing resolves an identifier (`name/server`)
  to one;
- there is no list of a room's bans, so a ban cannot be lifted from the UI;
- nothing lists or revokes the invitations a room has sent;
- kick and ban do not compare roles (a moderator can kick a `room_admin`), and
  an invitation's role is not capped by the inviter's own role;
- inviting a banned user creates an invitation whose acceptance then fails.

## Goal

Room moderators and administrators manage membership from the web client:
invite a user, follow and revoke pending invitations, change a member's role,
kick or ban a member, ban a non-member, lift a ban.

## Decisions made

- **Scope**: protocol, server, SDK and web client. The gaps listed above are
  closed by this feature, not by a separate one.
- **Designating a user**: by exact identifier (`name/server`, or `name` for a
  local user), resolved by the server. No user search or directory.
- **Hierarchy**: kick, ban and role change only target a user whose effective
  role is strictly below the actor's. The server owner is exempt and cannot be
  targeted.
- **Role change**: the new role can go up to the actor's own role, never above.
- **Invitation role**: chosen by the inviter, defaulting to the room's
  `defaultRole`, capped at the inviter's own role.
- **Sent invitations**: moderators see the room's pending invitations and can
  revoke one.
- **Inviting a banned user**: the client asks for confirmation, stating that the
  ban will be lifted. Confirming lifts the ban and sends the invitation;
  cancelling leaves the ban and sends nothing.
- **Inherited members** (membership held on a parent space): only ban is offered
  from the room; kick and role change apply to memberships held on the room
  itself. The UI shows where a membership comes from.
- **Ban reason**: a mandatory reason shown to the banned user, plus an optional
  internal note visible to moderators only. The ban list shows both, with who
  banned and when.
- **Kick reason**: optional, shown to the kicked user.
- **Banning a non-member**: allowed from the ban list, by identifier (e.g. a
  spammer of a public room).
- **Target side**: the room leaves the kicked or banned user's sidebar live; if
  it is open, a screen stating the removal or ban (with the reason) replaces the
  conversation.
- **Placement**: everything lives in the members panel: an Invite action, a
  pending invitations section, a bans section, and per-member actions on the
  member row / profile. Each action is shown only with the matching capability.
- **Out of scope**: system lines in the timeline for these events, see
  [`web-client-timeline-system-events`](../web-client-timeline-system-events/overview.md).

## Dependencies

- [`web-client-members`](../web-client-members/overview.md): the members panel
  hosts every action of this feature; it must ship first.
- [`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md): capabilities, room gate,
  join request screen.
- Followed by [`web-client-timeline-system-events`](../web-client-timeline-system-events/overview.md).
