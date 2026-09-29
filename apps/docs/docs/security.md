---
sidebar_position: 10
---

# Security

A checklist for operators, and what the server does for you.

## Operator checklist

- **Serve everything over TLS.** Terminate it in a reverse proxy in front of the
  server and set `server.api_url` and `server.web_url` to `https://` URLs.
- **Protect `secret.key`.** Generate it with `openssl rand -base64 32`, pass it
  through the environment or a secret manager, never commit it. Back it up
  separately from the database.
- **Keep credentials out of `config.toml`.** Use `${ENV_VAR}` references for the
  database URL, SMTP credentials, S3 keys and the metrics token.
- **Close the first-owner window.** Set `EKOZ_INITIAL_OWNER_EMAIL` so that only your
  address can create the owner account. Otherwise the setup token printed in the
  logs is the only barrier: create the owner immediately.
- **Restrict CORS.** List only the origins of your web client and admin console in
  `http.cors_allowed_origins`.
- **Choose the registration mode deliberately.** The default is `invite`. Use
  `open` only if you want public sign-up.
- **Protect `/metrics`.** Set `observability.metrics_token` before exposing it
  beyond a private network.
- **Do not expose PostgreSQL.** Only the server needs to reach it.
- **Restrict uploads.** Configure the MIME allow or block list, the maximum file
  size, per-user quotas and the global capacity from the admin console.

## What the server does

- Passwords are hashed with Argon2id.
- Access tokens are short-lived, refresh tokens are opaque and rotating, and a
  reused refresh token invalidates the session.
- The realtime stream authenticates with a single-use ticket of about 30 seconds,
  not with a long-lived token in the URL.
- MIME types are detected from the file content (magic bytes), never from the
  extension or the declared `Content-Type`.
- File downloads use short-lived signed URLs.
- Login, registration, password reset and verification-email resend share a
  fixed-window throttle per client IP and target identifier (default 10 requests
  per 15 minutes, answered with `429` and `Retry-After`). The counter is kept in
  memory per instance. General rate limiting is not implemented yet, so add limits
  at your reverse proxy.
- Secrets, tokens and message content are redacted from logs.
