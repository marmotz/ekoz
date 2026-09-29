---
sidebar_position: 1
---

# Deployment

The reference server ships as a Docker image built from the repository.

## Build the image

The build context is the monorepo root:

```bash
docker build -f apps/server/Dockerfile -t ekoz-server .
```

The image runs as a non-root user, exposes port `3010` and has a health check on
`/readyz`.

## Run it

The image contains no `config.toml`: every infrastructure parameter comes from the
environment as `EKOZ_<SECTION>__<KEY>` (see [configuration](configuration.md)), or
from a file you mount and point to with `EKOZ_CONFIG_FILE`.

```bash
docker run -d --name ekoz \
  -p 3010:3010 \
  -v ekoz_data:/app/apps/server/var \
  -e DATABASE_URL="postgresql://user:password@db:5432/ekoz" \
  -e EKOZ_SECRET_KEY="$(openssl rand -base64 32)" \
  -e EKOZ_SERVER__DOMAIN="ekoz.example.com" \
  -e EKOZ_SERVER__API_URL="https://ekoz.example.com" \
  -e EKOZ_SERVER__WEB_URL="https://app.ekoz.example.com" \
  -e EKOZ_INITIAL_OWNER_EMAIL="owner@example.com" \
  ekoz-server
```

Generate the secret key once and keep it: see [security](../security.md). The
volume holds local blob storage (default path `./var/blobs`); it is unnecessary
with an S3-compatible driver.

On every start the entrypoint runs `prisma db migrate` before launching the server.
If the database is unreachable or a migration fails, the container exits.

## Requirements

- **PostgreSQL 18** (the version used by the project's compose file).
- **A public FQDN** as `server.domain`. `localhost` and bare IP addresses are
  rejected. The domain is part of every user identifier and must never change for
  the life of a deployment.
- **A reverse proxy** terminating TLS in front of the server. `server.api_url` must
  be the public URL clients use.
- **An SMTP relay** for verification and password-reset emails.

## Health probes

- `GET /healthz`: liveness, no dependencies.
- `GET /readyz`: checks the database, migrations, the signing key and the storage
  driver; answers `503` when one fails.

## Single instance

The server currently runs as a single process. The credential throttle, the
session denylist and the event stream are per instance, so do not run several
replicas behind a load balancer.
