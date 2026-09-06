# Federation

**Status**: in discussion

## Context

The project adopts a new protocol, not compatible with Matrix. A standalone
server must remain fully useful; federation will be introduced progressively.

## Goal

Define a cross-server mechanism that allows reliable, secure and manageable
exchanges without weighing down the operation of a standalone instance.

## Decisions made

- The federation protocol is a minimal custom protocol (neither ActivityPub nor
  the Matrix model): discovery via `/.well-known/ekoz`, per-server Ed25519 keys,
  signed requests, home server authoritative for the room ordering. See
  [federation protocol](../../../../docs/technical/federation-protocol.md).
- Two servers establish a federation relationship after mutual approval by their
  owners.
- The first increment covers shared rooms, private messages, file sharing,
  presence and read receipts between servers.
- In a federated conversation, the user keeps their identifier and profile from
  their home server.
- An owner can sever a federation relationship with immediate effect.
- The server that creates a federated room administers its structure, rules and
  roles.
- A server owner can moderate their own users in a federated room, without acting
  on the users of other servers.
- After a severing, already-received federated content remains available locally
  under its retention rule; no further exchange with the peer is accepted.
- Migrating an account to another server is out of scope for the first federation
  increment.

## Depends on

- [Identity and profiles](../identity-and-profiles/overview.md), for the users'
  home identity.
- [Conversations](../conversations/overview.md), for shared rooms, private
  messages and read receipts.
- [Content and sharing](../content-and-sharing/overview.md), for files exchanged
  with remote members.
- [Server administration](../server-administration/overview.md), to approve,
  supervise and interrupt peer relationships.

## Feature order

- [Extensibility](../extensibility/overview.md) adds federatable content types
  that remain readable through a fallback rendering.
