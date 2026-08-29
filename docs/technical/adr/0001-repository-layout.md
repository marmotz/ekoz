# 0001 — Repository layout

**Status**: accepted

## Context

The project comprises a server, a reusable SDK and a demonstration client. These
parts have different lifecycles, audiences and release cadences. The protocol is
a shared contract that the SDK and federation depend on, independently of the
server implementation.

## Decision

Four separate Git repositories, one per domain:

- `spec`: functional specification, protocol, ADRs, backlog.
- `server`: reference server and its implementation documentation.
- `sdk-js`: JavaScript/TypeScript SDK for the protocol.
- `client-web`: React demonstration web client.

No global monorepo. Each code repository documents only its own implementation.
The protocol lives in `spec` and is referenced by version.

## Consequences

- Independent versioning and releases; the protocol is not tied to the server's
  cycle.
- Cost: cross-repo coordination (protocol versions, linked releases) must be
  tooled. Cross-cutting changes touch several repositories.
- The parent directory contains only these four folders, no files.
