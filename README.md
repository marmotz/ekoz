# Ekoz

Open chat protocol with a reference server, an SDK, a demonstration web client
and an admin console. One monorepo (Bun workspaces) — see
[repository layout](docs/technical/architecture.md).

## Layout

| Path              | Package              | Publishes | What                                          |
| ----------------- | -------------------- | --------- | -------------------------------------------- |
| `packages/sdk`    | `@ekozhq/sdk`        | npm       | JS/TS SDK for the Ekoz protocol.              |
| `apps/server`     | `@ekozhq/server`     | —         | Reference server (NestJS 12, Prisma 8, Bun).  |
| `apps/client-web` | `@ekozhq/client-web` | —         | Demonstration web client (React, Vite).      |
| `apps/admin`      | `@ekozhq/admin`      | —         | Admin console, deployed with the server.      |
| `docs/`           | —                    | —         | Functional spec, protocol, technical + ADRs.  |
| `backlog/`        | —                    | —         | Product/technical backlog, one area per part. |

## Getting started

```bash
bun install
bun run build        # build @ekozhq/sdk (consumed by the apps)
bun run typecheck
bun run lint
bun run test         # sdk + web apps
bun run test:server  # apps/server unit + integration (needs Docker)
```

Per workspace: `bun run --filter '@ekozhq/<name>' <script>`.

## Contributing

See [AGENTS.md](AGENTS.md) for conventions (English everywhere, design docs per decision,
tests with every change, Biome, Changesets). Each workspace has its own
`AGENTS.md` with specifics.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
