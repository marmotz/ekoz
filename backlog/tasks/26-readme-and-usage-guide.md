# sdk-js — README and usage guide

**Status**: todo
**Type**: docs
**Issue**: [#26](https://github.com/marmotz/ekoz/issues/26)

Reference: [../features/sdk-foundations/technical.md §15](../features/sdk-foundations/technical.md#15-conséquences-vérifiées).

## To do

1. `README.md`: install (via `bun link` during bring-up), `createClient({ server, store })`,
   the namespaced surface, the typed error model, and the session events.
2. Document the session store contract with a `localStorage`-backed example for
   browsers and a memory example for Node/Bun.
3. Spell out the registration flow: `auth.register` returns no tokens → the
   consumer then calls `auth.login` (with email verification in between
   depending on `registration.mode`).
4. Note the protocol-version policy and the `link`-only distribution for now.
5. Cross-link the consumers:
   [client-web](../features/web-client-foundations/overview.md)
   and the
   [admin console](../features/server-administration/overview.md).

## Dependencies

22-auth-and-setup-resources (done — `tasks/done/sdk-22-auth-and-setup-resources.md`), 23-profile-account-and-sessions-resources (done — `tasks/done/sdk-23-profile-account-and-sessions-resources.md`), 24-invitations-and-admin-resources (done — `tasks/done/sdk-24-invitations-and-admin-resources.md`).
