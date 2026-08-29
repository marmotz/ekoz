# Ekoz — specification

Source of truth for the Ekoz project: product requirements, protocol and
cross-cutting architecture decisions that span the implementations.

Ekoz is an open source federated messaging server, designed to be significantly
simpler to deploy and operate than Synapse/Matrix, with a new protocol that is
not Matrix-compatible.

## Project repositories

| Repository | Role |
|------------|------|
| `spec` (this repo) | Functional specification, protocol, cross-cutting decisions (ADRs), backlog |
| `server` | Reference server (Bun + NestJS + Prisma + PostgreSQL) |
| `sdk-js` | JavaScript/TypeScript SDK for the protocol, usable by any client |
| `client-web` | Demonstration web client (React), exercises the server features |

Each code repository documents only its own implementation. Every contract or
cross-cutting decision lives here and is referenced by version.

## Contents

- [`docs/functional/`](docs/functional/) — product requirements, scope, expected behaviour
- [`docs/protocol/`](docs/protocol/) — client↔server and server↔server protocol specification
- [`docs/technical/`](docs/technical/) — architecture and [architecture decision records (ADRs)](docs/technical/adr/)
- [`backlog/`](backlog/) — features, tasks, delivery order
