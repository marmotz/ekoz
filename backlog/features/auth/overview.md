# Auth

**Status**: [technical design](technical.md)

## Context

Split out of [web-client-foundations](../../_archives/features/web-client-foundations/overview.md),
which delivers only the client bootstrap. The reference server has shipped its
identity layer; this feature makes the authentication flows exercisable from the
demonstration UI.

It is a **cross-cutting feature**: everything it needs is decided and tracked
here, whichever part of Ekoz it touches (server, SDK, web client, and the
kurotako generator the forms need). A visitor
cannot yet learn the server's registration mode, so a small server + SDK
addition ships with the client work rather than as a separate feature.

## Goal

A visitor can register (in every server registration mode), verify their email
and request a new verification mail, sign in and out, and reset a forgotten
password, all against a running reference server. Delivered across the server
(public exposure of the registration policy), the SDK (its binding) and the web
client (the flows).

## Decisions made

- Lives in `src/features/auth/{api,components,hooks,routes}`; all network access
  through [`@ekozhq/sdk`](../../_archives/features/sdk-foundations/overview.md).
- **Registration policy is exposed by the server** (part of this feature, not a
  separate one): today `registration.mode` (`open` / `invite` / `admin`) and
  `email.verification_required` are not readable by an unauthenticated client.
  - Server: a new public `GET /auth/policy` (registration mode, whether email
    verification is required, minimum password length), read live so a change
    shows immediately; documented first in the
    [identity protocol](../../../docs/protocol/identity.md).
  - SDK: binds it (new resource method, changeset).
  - Client: shows the matching form: open, invitation-token field (pre-filled
    from the `?invite=` link the server puts in invitation mails), or a
    "registration closed, contact the administrator" message.
- **After registration** (no tokens are returned), the client always lands on the
  same `/check-email` screen; the user signs in afterwards, no automatic login.
  With verification on it says "check your mailbox" and offers a resend; with
  verification off (no mail is sent) it says the account is created and links to
  sign-in.
- **Email links** land on dedicated routes, matching the links the server
  already builds from `server.web_url`: `/verify-email?token=...` (verified
  automatically on load), `/reset-password?token=...` (new-password form),
  `/register?invite=...`.
- Password reset is a two-step flow: request by email (always reported as
  accepted, never disclosing whether the address exists), then confirm with the
  token from the mail.
- **Auth pages live outside the app shell**: a minimal centered layout (card,
  language and theme controls), while the sidebar + top bar shell wraps the
  signed-in pages only.
- **Signed-in user menu**: a minimal menu in the top bar (display name, sign out).
  The account screens extend it later
  ([`identity-and-profiles`](../identity-and-profiles/overview.md)).
- **Forms are generated with kurotako and run on TanStack Form**: kurotako has no
  React generator, so a `gen-react` feature is created in the kurotako backlog
  (headless typed hooks, validation delegated to the generated Zod schemas) and
  must be published before the client forms. No confirm-password field; a
  show/hide toggle on password inputs instead.
- The existing `/login` placeholder route is replaced by the real sign-in page;
  it remains the redirect target of the session guard.
- **Scope per part**: `apps/server` (public policy exposure), `packages/sdk`
  (binding), `apps/client-web` (all UI flows), kurotako (`gen-react`, tracked in
  its own repo backlog). Existing SDK auth bindings and
  server auth endpoints are reused as they are.
- **Out of scope**: first-owner setup (`POST /setup/owner`) stays outside the
  client; owner-created accounts and invitation management (admin console);
  MFA; profile and session management ([`identity-and-profiles`](../identity-and-profiles/overview.md)).

## Dependencies

- [web-client-foundations](../../_archives/features/web-client-foundations/overview.md) — bootstrap,
  layout, routing, SDK session wiring.
- [SDK foundations](https://github.com/marmotz/ekoz/blob/develop/packages/sdk/backlog/features/sdk-foundations/overview.md)
  — identity bindings (already shipped: `register`, `login`, `verifyEmail`,
  `resendVerification`, password reset).
- kurotako [`gen-react`](https://github.com/marmotz/kurotako/blob/develop/backlog/features/generator-react/overview.md)
  — must be published before the client forms (server and SDK parts can start
  earlier).
- [`identity-and-profiles`](../identity-and-profiles/overview.md) — the server
  identity layer this feature builds on (shipped). No separate item is created
  for the policy exposure: it is a task of this feature, ordered before the
  client registration form (server -> SDK -> client).

## Feature order

After `web-client-foundations`, before [`identity-and-profiles`](../identity-and-profiles/overview.md).
