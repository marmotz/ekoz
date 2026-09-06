# sdk-js — opt-in integration test suite

**Status**: todo
**Type**: sdk / CI
**Issue**: [#9](https://github.com/ekoz-chat/sdk-js/issues/9)

Reference: [../features/sdk-foundations/technical.md §13](../features/sdk-foundations/technical.md#13-tests).

## To do

1. `test/integration/` suite gated behind an env var (e.g. `EKOZ_TEST_SERVER`)
   pointing at a running reference server; skipped otherwise.
2. End-to-end flow: `setup/owner` → `login` → `me.get` → forced refresh →
   `sessions.list` → `logout`.
3. Cover one owner-only path (`invitations.create` / `admin.users.*`).
4. Document how to run it against the server's `compose.yaml`
   ([server compose](https://github.com/ekoz-chat/server/blob/main/compose.yaml)).
5. Keep it out of the blocking CI job for this increment (no server
   orchestration here yet); wire a manual / nightly workflow instead.

## Dependencies

[6-auth-and-setup-resources](6-auth-and-setup-resources.md), [7-profile-account-and-sessions-resources](7-profile-account-and-sessions-resources.md), [8-invitations-and-admin-resources](8-invitations-and-admin-resources.md).
