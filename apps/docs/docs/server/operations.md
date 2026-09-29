---
sidebar_position: 3
---

# Operations

## Backup

Two things hold state:

- **PostgreSQL**: accounts, conversations, the event log and settings. Back it up
  with `pg_dump` or your platform's snapshots, at a frequency matching the loss
  you accept.
- **Blob storage**: attachments and avatars. Back up the volume behind
  `storage.local.path`, or rely on the durability of your S3 bucket.

Also keep `secret.key` in your secret manager, separately from the backups. It seals
the server's stored secrets, including the signing private keys. Without it a
restored database cannot decrypt them, and rotating it makes previously sealed
values unreadable. Restore the database and the blobs from the same point in time
when possible: blobs are content-addressed and garbage-collected only after they
stay unreferenced past `storage.gc_grace_seconds`.

## Monitoring

- **Logs**: JSON, one object per line on standard output, each carrying a
  `requestId`. Collection is left to your platform (systemd, Docker, Kubernetes).
  Secrets, tokens and message content are never logged. Adjust `log_level` live
  from the admin console.
- **Health**: `/healthz` for liveness, `/readyz` for readiness (`503` on failure).
- **Metrics**: set `observability.metrics_enabled = true` to serve Prometheus
  metrics on `GET /metrics`. Set `observability.metrics_token` and scrape with
  `Authorization: Bearer <token>`. Without a token the endpoint is served on a
  loopback or private bind only.
- **Tracing**: set `observability.otlp_endpoint` (OTLP/HTTP) and a
  `trace_sample_ratio` between 0 and 1. Unset, tracing is fully off.
- **Admin console**: the supervision screens show storage usage and moderation
  queues.

## Updating

1. Read the server `CHANGELOG.md` for the target version.
2. Back up the database.
3. Build or pull the new image and restart the container. The entrypoint applies
   pending migrations before the server starts, and the container exits if one
   fails, so watch the first start.
4. Check `/readyz`.

Do not change `server.domain` during an update. Rolling back to an older image after
a migration ran requires restoring the database backup taken in step 2.

## Signing key rotation

The server signs with one active Ed25519 key, published in `/.well-known/ekoz`.
A retired key stays published and accepted for `signing.key_overlap_seconds`
(7 days by default) before being dropped.
