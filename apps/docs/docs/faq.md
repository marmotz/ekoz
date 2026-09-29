---
sidebar_position: 20
---

# FAQ

## Is the SDK on npm?

Not yet. `@ekozhq/sdk` is consumed by linking a local build, see the
[quickstart](getting-started/quickstart.md).

## Can I use `localhost` or an IP address as `server.domain`?

No. It must be a public, lower-cased FQDN, because it is part of every user
identifier and used for federation. For local development the committed
`config.toml` already works. Clients pass `resolveApiUrl` to the SDK instead of a
domain.

## Can I change `server.domain` later?

No. It is embedded in user identifiers and must stay stable for the life of a
deployment.

## I lost the setup token. How do I create the owner?

The token is printed to the server's standard output on the first start while no
owner exists. Restart the server to see it again in the logs, or set
`EKOZ_INITIAL_OWNER_EMAIL` and restart.

## Can I run several server replicas?

Not yet. Throttling, the session denylist and the event stream are per instance.

## Can I store files in S3?

Yes. Set `storage.driver = "s3"` and fill `[storage.s3]`. Use
`force_path_style = true` for MinIO and most self-hosted stores.

## Emails are not sent. What should I check?

Check `[email.smtp]` (host, port, `secure`, credentials). Messages are retried with
exponential backoff and, after 4 attempts, an `email.failed` entry is written to the
audit log. Locally, open Mailpit at `http://localhost:8025`.

## A setting is greyed out in the admin console.

The matching `EKOZ_<SECTION>__<KEY>` environment variable is set, which overrides
and locks the runtime value. Unset it to edit the setting from the console.

## What changed the last time I updated?

Read the `CHANGELOG.md` of the server and of the SDK.
