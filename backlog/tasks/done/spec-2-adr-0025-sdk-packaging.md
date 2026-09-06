# spec — the SDK packaging and protocol-version policy design: SDK packaging, distribution and protocol-version policy

**Status**: done
**Type**: docs
**Issue**: — (implemented before the monorepo consolidation)

Reference: [sdk-js SDK foundations technical design §16](../../features/sdk-foundations/technical.md#16-adr-à-écrire-dans-spec).

## Verified findings

- `docs/technical/` stops at `0024`; `0025` is the next free number.
- Repo `AGENTS.md` / design records:
  every design decision gets a `docs/technical/` page.

## To do

1. Write `docs/technical/sdk-packaging-and-protocol-policy.md`
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
     #39).
2. Add it to `docs/technical/README.md`.
3. Reference it from the protocol `README.md` transport section if relevant.

## Dependencies

None.
