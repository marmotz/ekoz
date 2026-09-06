# sdk-js — opt-in integration test suite

**Status**: todo
**Type**: sdk / CI
**Issue**: [#25](https://github.com/marmotz/ekoz/issues/25)

Reference: [../features/sdk-foundations/technical.md §13](../features/sdk-foundations/technical.md#13-tests).

## To do

1. `test/integration/` suite gated behind an env var (e.g. `EKOZ_TEST_SERVER`)
   pointing at a running reference server; skipped otherwise.
2. End-to-end flow: `setup/owner` → `login` → `me.get` → forced refresh →
   `sessions.list` → `logout`.
3. Cover one owner-only path (`invitations.create` / `admin.users.*`).
4. Document how to run it against the server's `compose.yaml`
   ([server compose](../../apps/server/compose.yaml)).
5. Keep it out of the blocking CI job for this increment (no server
   orchestration here yet); wire a manual / nightly workflow instead.

## Dependencies

22-auth-and-setup-resources (done — `tasks/done/sdk-22-auth-and-setup-resources.md`), 23-profile-account-and-sessions-resources (done — `tasks/done/sdk-23-profile-account-and-sessions-resources.md`), 24-invitations-and-admin-resources (done — `tasks/done/sdk-24-invitations-and-admin-resources.md`).
