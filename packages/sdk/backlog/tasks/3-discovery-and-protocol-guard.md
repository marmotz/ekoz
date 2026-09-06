# sdk-js — discovery resolution and protocol-version guard

**Status**: done
**Type**: sdk
**Issue**: [#3](https://github.com/ekoz-chat/sdk-js/issues/3)

Reference: [../features/sdk-foundations/technical.md §4](../features/sdk-foundations/technical.md#4-discovery-et-résolution-de-lapi), [§5](../features/sdk-foundations/technical.md#5-version-de-protocole).

## Verified findings

- `GET /.well-known/ekoz` is public and cacheable; shape in
  [server discovery.service.ts:20](https://github.com/ekoz-chat/server/blob/main/src/core/discovery/discovery.service.ts#L20)
  and [protocol/discovery.md](https://github.com/ekoz-chat/spec/blob/main/docs/protocol/discovery.md):
  `{ server, api, web, protocol_versions, signing_keys }`.
- Server currently exposes `protocol_versions: ["0"]` and does **not** read any
  request-side version header (`grep -rn protocol server/src` → discovery only).

## To do

1. `src/discovery/discovery.ts`: `resolve(server)` → `GET https://<server>/.well-known/ekoz`,
   returns the parsed document; in-memory cache for the client lifetime;
   `refresh()` forces a re-fetch.
2. Expose `api` (trim trailing `/`) as the REST base URL used by `HttpClient`.
3. `SUPPORTED_PROTOCOL_MAJORS = ['0']` constant; after resolution, if the
   intersection with `protocol_versions` is empty → throw `ProtocolMismatchError`
   before any business call.
4. Optional `createClient({ resolveApiUrl })` escape hatch (consumer-provided
   function returning the base URL) for local `bun link` dev; keep it a single
   hook, not a second competing config path.
5. `sdk.discovery.get()` / `sdk.discovery.refresh()` public methods.
6. Unit tests: resolution + cache; empty version intersection → mismatch error;
   `resolveApiUrl` override bypasses the fetch.

## Dependencies

[2-transport-core-and-errors](2-transport-core-and-errors.md).
