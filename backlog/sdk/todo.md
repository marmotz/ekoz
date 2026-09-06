# Tasks to do

The `sdk-js` backlog (per
[ADR 0019](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0019-backlog-lives-in-the-implementing-repo.md)).
Global documentation (functional spec, protocol, ADRs) lives in the sibling
[`spec`](https://github.com/ekoz-chat/spec) repository, referenced by absolute
URL. The reference server backlog is in
[`ekoz-chat/server`](https://github.com/ekoz-chat/server/blob/main/backlog/).

Implement in dependency order; each task file has a `## Dependencies` section and
each issue body carries `Depends on #N` (or `Depends on ekoz-chat/<repo>#N`)
lines.

## SDK foundations

[Overview](features/sdk-foundations/overview.md) — [technical design](features/sdk-foundations/technical.md)

| Done | Issue | Task | Description |
| ---- | ----- | ---- | ----------- |
| ☑ | [#1](https://github.com/ekoz-chat/sdk-js/issues/1) | [1-package-skeleton](tasks/1-package-skeleton.md) | Package skeleton, tsdown dual ESM/CJS, Vitest, ESLint, changesets, CI |
| ☑ | [#2](https://github.com/ekoz-chat/sdk-js/issues/2) | [2-transport-core-and-errors](tasks/2-transport-core-and-errors.md) | HttpClient, X-Request-Id, problem+json decoding, typed error hierarchy |
| ☑ | [#3](https://github.com/ekoz-chat/sdk-js/issues/3) | [3-discovery-and-protocol-guard](tasks/3-discovery-and-protocol-guard.md) | `/.well-known/ekoz` resolution + cache, protocol-version compatibility gate |
| ☐ | [#4](https://github.com/ekoz-chat/sdk-js/issues/4) | [4-session-manager-and-store](tasks/4-session-manager-and-store.md) | Token lifecycle, single-flight refresh, SessionStore adapter, lifecycle events |
| ☐ | [#5](https://github.com/ekoz-chat/sdk-js/issues/5) | [5-client-assembly-and-wire-types](tasks/5-client-assembly-and-wire-types.md) | Wire types, createClient, namespace assembly, index exports |
| ☐ | [#6](https://github.com/ekoz-chat/sdk-js/issues/6) | [6-auth-and-setup-resources](tasks/6-auth-and-setup-resources.md) | `setup` and `auth` bindings (register, login, logout, verify-email, password reset) |
| ☐ | [#7](https://github.com/ekoz-chat/sdk-js/issues/7) | [7-profile-account-and-sessions-resources](tasks/7-profile-account-and-sessions-resources.md) | `me`, `users`, `sessions` bindings (profile, avatar, email, username, delete) |
| ☐ | [#8](https://github.com/ekoz-chat/sdk-js/issues/8) | [8-invitations-and-admin-resources](tasks/8-invitations-and-admin-resources.md) | `invitations` and `admin.*` owner bindings |
| ☐ | [#9](https://github.com/ekoz-chat/sdk-js/issues/9) | [9-integration-test-suite](tasks/9-integration-test-suite.md) | Opt-in integration suite against a running reference server |
| ☐ | [#10](https://github.com/ekoz-chat/sdk-js/issues/10) | [10-readme-and-usage-guide](tasks/10-readme-and-usage-guide.md) | README and usage guide |
| ☐ | [#11](https://github.com/ekoz-chat/sdk-js/issues/11) | [11-admin-console-bindings](tasks/11-admin-console-bindings.md) | `setup.state`, `admin.users` reads + `triggerPasswordReset` (server admin console) |
