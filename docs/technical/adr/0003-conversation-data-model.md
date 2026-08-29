# 0003 — Conversation data model

**Status**: accepted

## Context

The functional spec describes a hierarchy of spaces containing rooms, and
"special private rooms" for one-to-one and group conversations. That wording is
ambiguous. Direct messages share most of a room's mechanics (messages,
attachments, pinned messages, reactions, mentions, read receipts) but differ on
a few points (no description, no directory listing, fixed membership, flattened
roles).

## Decision

A single **`room`** concept with a `type` discriminator:

- `space`: hierarchy node, holds no message.
- `channel`: room attached to a space, public / private / invite-only.
- `dm`: one-to-one conversation, outside the hierarchy, deduplicated (one `dm`
  per pair).
- `group_dm`: private group conversation, outside the hierarchy.

The `messages`, `attachments`, `reactions`, `receipts`, `memberships` tables are
shared and ignore the `type`. The differences are rules conditioned on the
`type`, not a separate schema.

| Aspect | `channel` | `dm` | `group_dm` |
|--------|-----------|------|------------|
| Attached to a space | yes (`space_id`) | no | no |
| Name / description / avatar | yes | derived from participants | optional name |
| Directory | per visibility | never | never |
| Membership | managed by roles | fixed (2, at creation) | additions allowed |
| Roles | full | flattened (peer to peer) | flattened + light creator |
| Creation | space admin | implicit, by a user | implicit |
| Leaving | yes | hide / archive | leaving allowed |

Space hierarchy: `parent_id` + a closure table for ancestor queries (permission
inheritance) and subtree queries. Cycles forbidden. Depth: configurable soft
limit, 4 by default. Permission resolution: merge of the space chain and the
room overrides, "most restrictive wins".

The wording "special private room" is dropped in favour of `dm` / `group_dm`.

## Consequences

- The messaging logic exists only once.
- The code must branch on `type` at the few divergent points; those branches
  must stay localised and tested.
