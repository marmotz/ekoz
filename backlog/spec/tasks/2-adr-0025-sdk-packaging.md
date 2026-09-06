# spec — ADR 0025: SDK packaging, distribution and protocol-version policy

**Status**: done
**Type**: docs
**Repo**: ekoz-chat/spec
**Issue**: [#2](https://github.com/ekoz-chat/spec/issues/2)

Reference: [sdk-js SDK foundations technical design §16](https://github.com/ekoz-chat/sdk-js/blob/develop/backlog/features/sdk-foundations/technical.md#16-adr-à-écrire-dans-spec).

## Verified findings

- `docs/technical/adr/` stops at `0024`; `0025` is the next free number.
- Repo `AGENTS.md` / [ADR 0015](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0015-decisions-are-recorded-as-adrs.md):
  every design decision gets an ADR.

## To do

1. Write `docs/technical/adr/0025-sdk-js-packaging-and-protocol-policy.md`
   (status: accepted) recording:
   - Public API shape: single namespaced client from `createClient(config)`.
   - Error model: typed exception classes mapped from the stable `code`.
   - Session persistence: consumer-provided `SessionStore` adapter; the SDK is
     storage-agnostic and multi-runtime (browser + Bun/Node).
   - Session lifecycle event emitter (`on` / `off` / `once`).
   - Build: dual ESM + CJS via tsdown; distribution `link`-only until the
     surface stabilises; changesets enabled now, npm publish deferred.
   - Protocol version: `X-Ekoz-Protocol` header on every request + a
     compatibility gate against the discovery `protocol_versions`; the server
     adds a tolerant reader (separate `server` task).
   - SDK wire types are sourced from the server code until the protocol
     "Identity and profiles" section is written (see
     [#3](https://github.com/ekoz-chat/spec/issues/3)).
2. Add it to `docs/technical/adr/README.md`.
3. Reference it from the protocol `README.md` transport section if relevant.

## Dependencies

None.
