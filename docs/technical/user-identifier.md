# User identifier format

## Context

`name@server` looks too much like an email address. Other options: `name#server`
(`#` is a URL fragment, gets encoded, breaks hrefs), `name:server` (`:` is the
port separator, ambiguous), `@name:server` (that is Matrix). An identifier
written sometimes one way and sometimes another breaks copy-paste, search and
mentions.

## Decision

Single canonical form: **`name/server`** (e.g. `alice/chat.example`).

- Stored and displayed as is, prefixed with `@` in the UI: `@alice/chat.example`.
- Unambiguous parsing: `name` contains no `/`, `server` is a domain with no `/` —
  split at the first `/`.
- `name`: lowercase, NFC, characters `[a-z0-9_.-]`, max length 64, **unique per
  server**. Unrelated to the display name (may match another user's display
  name, may differ from its own). No reserved names in the first increments.
- `server`: a real registrable domain. No `localhost`. In development, a fake
  domain via `/etc/hosts` is mandatory.
- Short form `alice` tolerated only within the local server context, always
  resolved to the full form.
- Mentions in text: `@alice/chat.example`, detected via
  `@[a-z0-9_.-]+/[a-z0-9.-]+`.

## Consequences

- URL-safe and routable (`/@alice/chat.example`).
- Neither email nor Matrix.
- The server name appears after the name, an order judged more readable in use.
