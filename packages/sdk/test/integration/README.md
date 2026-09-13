# SDK integration tests

Opt-in end-to-end tests against a real reference server. Skipped by default —
`bun run test` (unit tests, mocked `fetch`) never runs these. Not part of the
blocking CI job for this increment; promote to a scheduled / nightly workflow
once the conversations increment needs broader server orchestration.

## Running

1. Start the server's local dependencies (Postgres + Mailpit):

   ```bash
   cd apps/server
   docker compose -f compose.yaml up -d
   ```

2. Point the server at a clean database and start it:

   ```bash
   bun run db:reset
   bun run start:dev
   ```

   The server listens on `http.port` (default `3010`, see `.env.example`).

3. From `packages/sdk`, run the suite against that server:

   ```bash
   EKOZ_TEST_SERVER=http://localhost:3010 bun run test:integration
   ```

`EKOZ_TEST_SERVER` is the REST base URL directly (no discovery, no TLS) — the
suite passes it to `createClient({ resolveApiUrl })`, the same escape hatch
documented in the [README](../../README.md#quick-start) for local development.

Each run needs a database with no owner account yet (`setup/owner` is a
one-shot endpoint) — repeat step 2's `db:reset` between runs.
