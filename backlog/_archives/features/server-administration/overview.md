# Server administration

**Status**: technical design — see [technical.md](./technical.md)

## Context

The server targets operators with very varied skills and contexts. Its
administration must therefore stay understandable and safe, from the home server
to the public or private organisation.

Routine administration is done through a web interface. That interface is a core
application shipped with the reference server (the **admin console**), and this
feature covers both what an operator can do and the application that lets them do
it. It is distinct from the demonstration
[web client](../../../features/web-client-foundations/overview.md), which exercises
end-user features.

The server has already shipped its identity and account-administration endpoints
(`POST /setup/owner`, `admin/users`, `admin/owners`, `admin/username-requests`,
`invitations`), so a first, narrow increment of the console is buildable now, in
particular to initialize a server and create the first accounts so account
creation can be exercised in real conditions.

## Goal

Allow configuring, supervising and moderating a server, as well as administering
its users and its spaces, through a web application deployed with the server.

## Decisions made

### Administration capabilities

- Routine administration operations are done through the admin console;
  infrastructure parameters stay configurable at deployment time.
- The first owner account is created explicitly when the server is initialized:
  either through an email address fixed at deployment (the only one allowed), or
  through a single-use token printed in the logs. The initialization endpoint
  closes permanently afterwards. See
  [server initialization](../../../../docs/technical/server-initialization.md).
- A server can have several owners.
- The owner can create accounts, reset passwords, suspend or delete accounts and
  grant or revoke administration roles.
- A suspension invalidates existing sessions and blocks login as well as any
  access to the server until reactivation.
- Global moderation allows banning a user from the server, receiving reports,
  deleting a message or content server-wide and managing any space or room.
- Every administration and global moderation action is recorded in a dated,
  attributed audit log.
- The supervision interface shows users and their activity, storage usage, server
  health and, when available, federation state.
- Configuration follows a layered model: a TOML file at deployment, overrides
  from the admin for `runtime` parameters, with the environment able to lock a
  parameter. The admin never writes to the file. See
  [configuration model](../../../../docs/technical/configuration-model.md).

### Admin console application

- The admin console is a core application of the reference server and lives in
  the server repository (monorepo). This implies restructuring the repo into
  Bun workspaces (server app + admin app + shared config); a `docs/technical/` page records the
  layout.
- It is a React single-page application, same stack as the demonstration client
  ([web client stack](../../../../docs/technical/web-client-stack.md)):
  React, Vite, TypeScript, Tailwind CSS 4, shadcn/ui, Bun, Vitest.
- It is deployed separately from the server (its own build and origin); NestJS
  does not serve its assets.
- All network access goes through
  [`@ekozhq/sdk`](../sdk-foundations/overview.md), never a direct `fetch`.
  During bring-up the SDK is consumed via `npm link` (no publish).
- Admin console forms validate input with the Zod schemas kurotako generates
  from the API contract (`api` source, `zodGenerator` extended to that
  namespace in [SDK foundations](../sdk-foundations/overview.md)), exported by
  `@ekozhq/sdk` — no hand-written validation schema duplicating a server DTO.
- UI available in French and English (i18n catalogues); code identifiers in
  English.
- Every design decision or notable change is written up under `docs/technical/`.

## Increments

- **First increment** (buildable now): repo restructure into workspaces, then the
  console covering server initialization (owner setup via fixed email or
  single-use token), owner sign-in, account creation, suspension / unsuspension,
  deletion, owner grant / revoke, username-change request review, invitation
  management. Mostly mapped to endpoints the server already exposes; this
  increment adds only the read endpoints the console needs (`GET /admin/users`,
  `GET /admin/users/:id`, `GET /setup`) plus an owner-triggered password reset.
  No configuration editing and no audit-log viewer here.
- **Later increments**, each landing as the corresponding server feature ships
  (see Feature order):
  - audit-log consultation (dated, attributed, filterable) — introduces a
    read-only `admin/audit` endpoint;
  - runtime configuration editing — introduces an `admin/config` endpoint (none
    exists yet; the code already partitions parameters into `infra` / `runtime`
    and `ConfigService.describe()` is in place). Which `runtime` keys are
    actually offered in the UI, and how a value locked by the environment is
    surfaced, is decided when that increment starts.
  - global moderation and reports handling, supervision dashboards, federation
    state.

## Depends on

- [Identity and profiles](../../../features/identity-and-profiles/overview.md), for
  administering accounts and roles.
- [SDK foundations](https://github.com/marmotz/ekoz/blob/develop/packages/sdk/backlog/features/sdk-foundations/overview.md),
  the console's only integration surface.

## Feature order

- [Conversations](../../../features/conversations/overview.md) introduce the server owner role,
  which holds global administration.
- [Content and sharing](../../../features/content-and-sharing/overview.md) expose the storage
  and link preview settings to the server owner.
- [Notifications](../../../features/notifications/overview.md) expose channel enablement and the
  global rules to the server owner.
- [Federation](../../../features/federation/overview.md) exposes peer approval, supervision and
  relationship severing to the server owner.
- [Extensibility](../../../features/extensibility/overview.md) exposes extension installation,
  approval and enablement to the server owner.
