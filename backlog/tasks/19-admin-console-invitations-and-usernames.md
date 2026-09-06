# admin console — invitations and username-change requests

**Status**: todo
**Type**: front
**Issue**: [#19](https://github.com/marmotz/ekoz/issues/19)

Reference: [../features/server-administration/technical.md §7](../features/server-administration/technical.md#7-screen--endpoint-map).

Two review screens on endpoints the server already exposes.

## To do

1. **`routes/invitations.tsx`** — `GET /invitations` list (email, created,
   expiry, used/pending). Create form (optional email, optional expiry in days)
   → `POST /invitations`; show the returned token once with a copy button.
   Revoke → `DELETE /invitations/:id` with a confirm dialog.
2. **`routes/username-requests.tsx`** — `GET /admin/username-requests` with the
   `status` filter (`pending` / `approved` / `rejected`). Per pending row:
   approve → `POST /admin/username-requests/:id/approve` (show the resulting
   identifier), reject → `POST /admin/username-requests/:id/reject`. Query
   invalidation + toast after each.
3. **Nav** — register "Invitations" and "Username requests" sidebar entries via
   `registerNav()`.
4. **i18n** — `invitations` namespace; username-request strings in it or a
   dedicated namespace.
5. **Tests** — list renders; create shows the token; revoke confirms and calls
   the SDK; approve / reject call the right method and invalidate; status filter
   works. SDK mocked.
6. **CHANGELOG.md** — entry under `## [Unreleased]`.

## Dependencies

- 16-admin-console-bootstrap (done — `tasks/done/server-16-admin-console-bootstrap.md`)
- #27 —
  `invitations` and `admin.username-requests` bindings land with sdk-js #8; this
  task consumes them.
