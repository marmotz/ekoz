# Server OpenAPI documentation

**Status** : technical design — [technical.md](technical.md)

## Context

The reference server (`apps/server`, NestJS 12) exposes an HTTP API consumed by
`@ekozhq/sdk`, the admin console and the demonstration web client. There is no
machine-readable description of that API today; the protocol lives in `docs/` as
prose and the SDK bindings are hand-written against it.

## Goal

Produce and maintain an OpenAPI description of the server HTTP API, kept in sync
with the actual routes, and decide how it is generated, published and consumed.

## Product decisions

- **Source of the spec**: derived from the code via `@nestjs/swagger` decorators
  on controllers and DTOs. No hand-written OpenAPI file.
- **Exposure**: the server serves a live Swagger UI / spec endpoint, and a spec
  file is generated from the same document.
- **Generated file**: `apps/server/openapi.json` (JSON; OpenAPI JSON and YAML
  carry the same detail, JSON is the default). It is a versioned artefact,
  regenerated from the code.
- **Scope**: every route consumed by `@ekozhq/sdk`. Routes outside the SDK
  surface are out of scope for now.
- **Consumers**: the spec is the source of truth for SDK type pre-generation.
  That pre-generation is done by **kurotako** (a separate third-party app, not in
  this repo) and is out of scope here — this feature only guarantees the spec is
  complete and exploitable.
- **CI drift check**: kurotako's `tako check` command detects drift between the
  committed spec and the code. CI runs it; drift is a failure.
- **Design page**: a cross-cutting page is added under `docs/technical/`
  (CONTRIBUTING convention).

