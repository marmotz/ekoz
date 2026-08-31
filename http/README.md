# `http/` — manual API collection (Hurl)

Hand-run requests against a locally running server, to _use_ the API while server-core is built (the automated suite
lives in `src/**/*.e2e-spec.ts`). These `.hurl` files double as living documentation of the current endpoints.

**One request per file, one directory per endpoint group.** Hurl writes only the last entry's response body to stdout,
so a multi-request file hides all but the last response. One request per file means running it always shows its
response.

## Layout

```
http/
  vars.env.example             template — copy to vars.env (gitignored)
  health/
    healthz.hurl               GET /healthz
    readyz.hurl                GET /readyz
  discovery/
    well-known.hurl            GET /.well-known/ekoz
  metrics/
    scrape.hurl                GET /metrics  (404 unless metrics_enabled)
  blobs/
    not-found.hurl             GET /blobs/:id  (404 until a feature adds a policy)
  setup/
    create-owner.hurl          POST /setup/owner  (404 until identity #18)
  auth/
    login.hurl                 POST /auth/login    (401 until an account exists)
    refresh.hurl               POST /auth/refresh  (401 without a refresh token)
    logout.hurl                POST /auth/logout   (401 without an access token)
  sessions/
    list.hurl                  GET    /sessions              (401 without an access token)
    rename.hurl                PATCH  /sessions/:id          (401 without an access token)
    revoke.hurl                DELETE /sessions/:id          (401 without an access token)
    revoke-all.hurl            DELETE /sessions?all=true     (401 without an access token)
```

Every file must pass as-is against a fresh local-dev server. A path needing a non-default config or unmerged work stays
a comment in the closest file (see
`metrics/scrape.hurl`, `setup/create-owner.hurl`).

## Prerequisites

- [Hurl](https://hurl.dev) (`hurl --version`).
- Dev dependencies up: `docker compose up -d` (PostgreSQL on 5432, Mailpit on 1025 / UI 8025).
- `.env` with `DATABASE_URL` and `EKOZ_SECRET_KEY` (32 bytes base64,
  `openssl rand -base64 32`).
- Schema applied: `bun run db:deploy`.
- Server running: `bun run start:dev` (binds `:3010` per `config.toml`).
- `cp http/vars.env.example http/vars.env` and adjust.

## Run

```bash
# one request — its response body prints to stdout
hurl --variables-file http/vars.env http/health/readyz.hurl

# check its assertions
hurl --variables-file http/vars.env --test http/health/readyz.hurl

# the whole collection
hurl --variables-file http/vars.env --test --glob 'http/**/*.hurl'

# full request + response (headers and body)
hurl --variables-file http/vars.env --very-verbose http/discovery/well-known.hurl
```

`vars.env` sets `base_url`; override inline with
`--variable base_url=http://ekoz.localhost:3010`.
