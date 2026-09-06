# HTTP API conventions

## Context

The REST surface is consumed by `sdk-js` and, later, by third-party clients and
peer servers. A few conventions must be fixed once, centrally, because they
affect every endpoint and the SDK's shape. They emerged while writing the
[server-core technical design](../../backlog/features/server-core/technical.md).

A dedicated `server-core` backlog feature was also created to hold the
non-functional foundations (skeleton, config, initialization, shared storage /
email / audit), delivered before `identity-and-profiles`.

## Decision

- **Error format**: `application/problem+json` (RFC 9457). Body:
  `{ type, title, status, detail, code }`. `code` is a stable machine-readable
  string namespaced by domain (e.g. `identity.username_taken`). The SDK surfaces
  `code` as a typed error.
- **Identifiers**: generated entity ids are ULID, assigned application-side — see
  [entity identifier format](entity-identifier-format.md). No sequential integer
  ids are exposed.
- **Timestamps**: UTC everywhere, ISO-8601 strings in payloads, `timestamptz` in
  the database.
- **Request correlation**: every response carries `X-Request-Id`; clients may
  send one and it is echoed. Logged on both sides.
- **Validation**: request bodies validated at the edge; invalid input returns a
  problem+json with `status = 422` and `code = "validation_failed"` plus a
  `errors` array.
- **Migrations**: applied by the deployment entrypoint before the app serves
  traffic; the app only verifies the schema is current and refuses to serve
  otherwise (no migrate-on-boot, to avoid races between replicas).

## Consequences

- `sdk-js` implements one error-decoding path for the whole API. The
  `application/problem+json` body is described once as a schema in the
  [OpenAPI description](openapi-description-and-sdk-types.md).
- The protocol spec documents problem+json and the `code` namespace as part of
  its transport section.
- Feature-local implementation choices (table shapes, internal services) stay in
  each feature's `technical.md` "Alternatives considered" table, not in ADRs.
