---
sidebar_position: 2
---

# Installation

This page sets up a local development instance. For a real deployment see
[deployment](../server/deployment.md).

## Requirements

- [Bun](https://bun.sh) 1.4.0 or later
- Docker, for PostgreSQL and a local mail catcher

## Steps

From the repository root, install the workspaces and go to the server:

```bash
bun install
cd apps/server
cp .env.example .env
docker compose up -d          # PostgreSQL 18 on :5432, Mailpit on :1025 (SMTP) and :8025 (UI)
bun run db:migrate            # apply the migrations to the development database
bun run start:dev
```

Check that the server is alive:

```bash
curl localhost:3010/healthz   # {"status":"ok"}
```

`compose.yaml` only starts the dependencies. The server itself runs on the host.
The committed `config.toml` is the local-development baseline. Mail sent by the
server (verification, password reset) is caught by Mailpit at
`http://localhost:8025`.

## First owner

A fresh server has no account. The first owner is created explicitly, in one of
two ways:

1. Set `EKOZ_INITIAL_OWNER_EMAIL` in `.env`: only that address can create the
   owner account.
2. Leave it unset: on first start the server prints a single-use setup token to
   its standard output, and creating the owner requires it.

Once the first owner exists, the setup endpoint is closed permanently. Further
owners are added from the admin console.

## Web client and admin console

```bash
bun run --filter '@ekozhq/client-web' dev   # http://localhost:5173
bun run --filter '@ekozhq/admin' dev        # http://localhost:7010
```

Both origins are already allowed by `http.cors_allowed_origins` in the local
`config.toml`.
