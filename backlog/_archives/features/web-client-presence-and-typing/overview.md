# Web client presence and typing

**Status**: done, see [technical.md](./technical.md)

## Context

Presence (online / away / offline, from heartbeats) and typing indicators are
part of the first increment and implemented by the server
(`POST /presence/heartbeat`, `POST /rooms/:id/typing`, `presence` and typing
frames over SSE), see [presence and typing](../../../../docs/protocol/presence-and-typing.md).
The web client neither sends heartbeats nor displays either.

The server side has gaps that make a reliable display impossible as is:

- a `presence` frame is only pushed on a heartbeat, so a peer lapsing to
  `away` or `offline` (tab closed, machine asleep) is never announced;
- nothing is sent when the stream opens, so a client knows no status until
  each peer's next heartbeat;
- a frame is pushed on every heartbeat, not only on a status change as the
  protocol page states.

## Goal

A user sees whether the people they talk with are online, away or offline, and
who is typing; their own presence and typing are published.

## Decisions made

- **Server gaps are fixed in this feature**: a frame when a peer's status
  lapses to `away` / `offline`, the current statuses of visible peers when the
  stream opens, and frames on status change only (code aligned on the
  protocol page).
- **Own presence**: heartbeats while the client is open; `away` is declared
  automatically when the tab is hidden or the user has been inactive for a
  while; the user can also choose to appear away manually.
- **Manual "appear away" is synced to the account**: it follows the user on
  every device and survives reloads until they switch back to online. This is
  a protocol evolution (persistent per-account state).
- **Presence is shown** on: the members panel, a member's public profile,
  direct conversations (sidebar and header), and message authors in the
  timeline.
- **Members panel filter**: this feature adds a "hide offline members" toggle
  to the members panel, available in both its views (by role and
  alphabetical), remembered locally like the panel's other preferences.
- **Typing is shown** as a line above the composer in the open room
  ("Alice is typing…", "Alice and Bob are typing…", "Several people are
  typing…" beyond three), and as an indicator on sidebar rooms where someone
  is typing.
- **Typing is always sent**: no opt-out preference.

## Dependencies

- [`web-client-chat`](../web-client-chat/overview.md): realtime stream, composer.
- Delivered **after** [`web-client-members`](../web-client-members/overview.md)
  (members panel, profile) and
  [`web-client-direct-messages`](../../../features/web-client-direct-messages/overview.md)
  (conversations in the sidebar): this feature adds presence to all surfaces
  at once.
