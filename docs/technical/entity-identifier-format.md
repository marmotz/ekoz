# Entity identifier format

## Context

[HTTP API conventions](api-conventions.md) fixed "UUID v7 for all entity ids, generated application-side" as an API convention,
in one line, without weighing the alternatives. Identifiers are hard to change later: they appear in URLs, in payloads
consumed by `sdk-js` and third-party clients, in federation messages between peer servers, in logs, and as primary keys
with the index-layout consequences that implies. They deserve their own decision record.

Requirements for a generated entity id:

- **Non-enumerable** — knowing one id must not reveal others. Rules out sequential integers.
- **Safe to expose** in URLs and payloads.
- **Insert locality** — a primary key whose values increase roughly with creation time keeps new rows at the right edge
  of the B-tree, avoiding the page splits, index bloat and cache misses that a fully random key (UUID v4, CUID2) causes
  on a write-heavy chat workload.
- **Coarse recency** — "newest first" listings and admin views read acceptably when ordered by id. This is *not* a total
  or causal order (see the ordering note below); anything that needs one uses an explicit sequence.
- **Client-generatable** — the application assigns the id before insert, so it can be returned synchronously and used in
  the same transaction.
- **Interoperable** — peer servers exchanging entity references ([federation protocol](federation-protocol.md)) must all
  produce and parse the same format. A format that is a single-language library, or that needs a spec of its own, is a
  liability.
- **Ergonomic** — an id is copied by hand from a URL or a log line often enough that a double-click should select the
  whole thing.

UUID v7 meets every requirement except the last: the four `-` separators are word boundaries, so selecting a v7 id takes
a click-drag instead of a double-click, every time.

### Ordering is not the id's job

A generated id is **not** the ordering mechanism, and no client-generated id can be. Both ULID and UUID v7 are a
millisecond timestamp followed by random bits:

- Within one process the generator is monotonic (the random tail is incremented for ids minted in the same millisecond),
  so ids from a single instance sort in creation order.
- **Across instances, and under clock skew, they do not.** Two ids minted in the same millisecond on two servers sort by
  their random tails — an arbitrary order, unrelated to causality or even true wall-clock time.

This is fine, because the system already has its authority for order:
[event log and ordering](event-log-and-ordering.md) gives every room an append-only log with a `seq` that is **monotonic per room
and assigned by the room's home server**. Causally related events are ordered by `seq`, never by id. Any other place
that needs a stable total order (e.g. the per-account fan-in feed cursor)
carries its own monotonic cursor or orders by an explicit `(created_at, id)`
pair where `id` is only a deterministic tie-breaker. `ORDER BY id` alone is used only where "approximately newest first"
is good enough.

## Decision

Generated entity ids are **ULID**, assigned application-side, via Prisma's
`@default(ulid())` (native to the Prisma 8 / "Prisma Next" line the server runs — see [server stack](server-stack.md)).

- 26 characters, Crockford base32 (`0-9A-HJKMNP-TV-Z`, no `-`, no ambiguous
  `I`/`L`/`O`/`U`). Double-click-selectable.
- A 48-bit millisecond timestamp prefix (like UUID v7) giving insert locality and coarse recency — with the ordering
  caveat above.
- 80 bits of randomness — non-enumerable, no meaningful collision risk.
- Stored as `text` (Postgres has no native ULID type; the byte overhead over a 16-byte `uuid` is accepted for the
  ergonomics).

Natural keys keep their own scheme where one is already unique and meaningful:
configuration `settings.key`, content-addressed `blob.hash`, the short random
`server_signing_key.id`. The `name/server` user identifier ([user identifier](user-identifier.md)) is unaffected — it is
not a generated record id.

Federation: the protocol spec documents entity ids as opaque ULID strings; peer servers treat them as such and must not
parse the timestamp prefix for anything beyond coarse local ordering.

## Consequences

- [HTTP API conventions](api-conventions.md) points here for the identifier
  format; "UUID v7" in the server-core technical design is replaced by
  `@default(ulid())` throughout.
- No new dependency: the `ulid()` generator ships with the Prisma client.
- Existing implementation is unaffected — no entity with a generated id has been built yet (the first, `settings`, uses
  a natural key). This is settled before
  `identity-and-profiles` introduces `User` / `Session`.
- Features that need real ordering must use `seq` or a dedicated cursor, not the id — restated here so it is not
  re-derived per feature.
- `sdk-js` and the [OpenAPI description](openapi-description-and-sdk-types.md) type entity ids as a 26-char base32 string pattern, not as `format: uuid` (enforced by a shared `entityIdSchema`).

## Alternatives considered

| Point        | Retained                  | Rejected                           | Why                                                                                                                                                                                                                                                                                                                                                        |
|--------------|---------------------------|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Id format    | ULID (`@default(ulid())`) | UUID v7                            | Identical properties — same ms-timestamp-plus-random structure, same weak cross-instance ordering, same insert locality — but the `-` separators defeat double-click selection in URLs and logs                                                                                                                                                            |
|              |                           | CUID2                              | No timestamp at all (v2 dropped it), so no insert locality; not a standard — a single JS library every peer implementation would have to reproduce exactly; multi-round hashing makes generation markedly slower                                                                                                                                           |
|              |                           | KSUID                              | Also dash-free and k-sortable, but a 1-second timestamp resolution means far more same-bucket ids, making the ordering even coarser                                                                                                                                                                                                                        |
|              |                           | nanoid                             | Prisma's `nanoid()` preset takes only a size, no custom alphabet — the default `A-Za-z0-9_-` contains `-` and `_`, so it fails the ergonomic test. Fully random anyway: no insert locality. Faster to *generate*, but id generation is sub-microsecond and never the bottleneck — the cost that matters is at the database, where a time-prefixed key wins |
|              |                           | UUID v4                            | Fully random: no insert locality, index bloat on a write-heavy workload                                                                                                                                                                                                                                                                                    |
|              |                           | Sequential integers                | Enumerable; leaks volume and lets clients walk the id space                                                                                                                                                                                                                                                                                                |
| Storage type | `text`                    | native `uuid` + encode at the edge | Keeping a base32 layer over a `uuid` column (TypeID-style) was attractive for typed, prefixed ids but adds an encode/decode seam on every read and write; revisit if per-type id prefixes become worth it                                                                                                                                                  |
