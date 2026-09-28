# Link previews

## Context

The composer wants to show a preview (title, description, image) for a link
the author is about to send, fetched server-side so it is available to every
reader without each of them independently loading the target page. Fetching
an owner-supplied URL from the server is a classic SSRF vector: without
safeguards, a user could get the server to make requests to its own internal
network (other containers, the cloud metadata endpoint, localhost services)
and read back whatever comes back as a "preview". The SSRF policy is therefore
the core content of this page.

## Decision

### Opt-in, throttled, server-side fetch

`link_previews.enabled` (runtime, default **`false`**): an outbound fetcher is
opt-in per deployment, not on by default. When off,
`POST /link-previews` answers `404 link_preview.disabled` and any
`linkPreviewUrl` on a message send/edit is ignored. `POST /link-previews`
([link-preview.controller.ts](../../apps/server/src/core/link-previews/link-preview.controller.ts))
is authenticated and throttled per user
([link-preview-throttle.guard.ts](../../apps/server/src/core/link-previews/link-preview-throttle.guard.ts),
a fixed-window counter keyed by `userId`, `link_previews.throttle` runtime
object, default `{ window: "1m", max: 10 }`) — the same fixed-window mechanism
`auth.sensitive_throttle` uses elsewhere, keyed by user instead of IP since
the caller is always authenticated here.

### The SSRF policy

`safeFetch` ([safe-fetch.ts](../../apps/server/src/core/net/safe-fetch.ts)),
used for both the HTML page fetch and the preview image fetch:

- **Scheme restricted to `http(s)`.** Anything else (`file:`, `ftp:`, …) is
  rejected before any network activity.
- **DNS resolved and validated before connecting.** The hostname is resolved
  with `dns.lookup`, and the resolved address must classify as public
  ([address-classifier.ts](../../apps/server/src/core/net/address-classifier.ts))
  — refused: loopback (`127.0.0.0/8`, `::1`), RFC 1918 private ranges
  (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), CGNAT (`100.64.0.0/10`),
  link-local **including the cloud metadata address**
  (`169.254.0.0/16`, which covers `169.254.169.254`), multicast/broadcast
  (`224.0.0.0/4`, `255.255.255.255`), IPv6 loopback/unspecified (`::1`, `::`),
  IPv6 link-local (`fe80::/10`), IPv6 ULA (`fc00::/7`), and IPv6 multicast
  (`ff00::/8`). An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) is unwrapped
  first and classified by its IPv4 form, so that bypass does not slip through.
- **The connection is pinned to the checked address**, not re-resolved at
  connect time: the outbound TCP `host` is the already-validated IP, while
  `Host`/TLS SNI still carry the original hostname (so virtual hosting and TLS
  still work). This closes the DNS-rebinding gap — a hostname that resolves
  differently between the check and the actual connect cannot slip a private
  address past the check.
- **Redirects are re-validated the same way**, up to `maxRedirects` (3): each
  `Location` is resolved relative to the current URL, then goes through the
  same scheme check, DNS lookup and address classification as the original
  request. A redirect chain cannot be used to reach a private address that the
  initial URL itself couldn't.
- **5-second timeout**, **1 MiB response cap** for the HTML page (a streaming
  reader that aborts once the cap is exceeded, not a post-hoc check after
  buffering the whole body), **5 MiB cap** for the preview image.
- **`Content-Type` allowlist per call**: `text/html` only for the page fetch,
  `image/*` only for the image fetch — a response of any other type is
  rejected outright, closing off content-type confusion (e.g. serving a script
  as if it were the page).
- **No cookies ever sent or stored**, and a fixed `User-Agent` naming the
  server (`Ekoz-LinkPreview/1.0 (+…)`) rather than impersonating a browser —
  the target site can identify and rate-limit the fetcher if it wants to.
- A **test-only escape hatch**, `allowPrivateAddresses`, lets integration
  tests point `safeFetch` at a local HTTP fixture without disabling the
  production checks; it is never reachable from request-handling code.

### Parsing

`parseHtmlMetadata`
([html-metadata.ts](../../apps/server/src/core/link-previews/html-metadata.ts))
uses `htmlparser2`, a streaming parser, rather than loading a DOM — the page
is treated as untrusted input and never executed or fully materialized.
Extracted: `og:title`/`og:description`/`og:site_name`/`og:image`, falling back
to `twitter:title`/`twitter:description`/`twitter:image`, falling back to
`<title>` text and `<meta name=description>`. `og:*` wins over `twitter:*`
wins over the plain tags. The image URL, if any, is resolved against the
page's final URL (post-redirects) and fetched through the same `safeFetch`
SSRF policy, `image/*`-only.

### Cache, throttle, and message snapshot

- `LinkPreview` rows cache by normalized URL (`http(s)` only, fragment
  stripped — [link-preview.service.ts](../../apps/server/src/core/link-previews/link-preview.service.ts)
  `normalize`). A cache hit within `link_previews.cache_ttl` (runtime, default
  `24h`) is served with no outbound fetch at all.
- **A failed fetch is cached too**, fixed at 1 hour regardless of
  `link_previews.cache_ttl` — a broken or unreachable site is not re-fetched
  on every keystroke while the author is typing.
- The preview's image, once fetched, is ingested as a blob with no uploader
  (never quota-charged) and annotated the same way an attachment is — see
  [media thumbnails](media-thumbnails.md); readers only ever download it from
  the server's own signed-URL mechanism (see [signed file URLs](signed-file-urls.md)),
  never directly from the original site.
- On send or edit, the chosen `linkPreviewUrl` is **copied into
  `MessageLinkPreview`**, a snapshot (`{ messageId, url, title, description,
  siteName, imageBlobId }`) distinct from the `LinkPreview` cache row — so a
  later cache refresh (the target page changes its title) never rewrites an
  already-sent message's preview. If the cache entry has expired by send time,
  the server fetches it synchronously once rather than sending with stale or
  missing data.

## Alternatives considered

- **Fetching after sending, in a background worker.** Rejected: the author
  would not see or be able to choose the preview before the message is
  already sent — the composer's "pick which link, see the preview" flow
  depends on a synchronous-enough response while composing.
- **Fetching by each reader's own client**, instead of server-side. Rejected:
  it exposes every reader's IP address to the linked site, and browser CORS
  would block most cross-origin previews anyway without a proxy — which is
  what the server-side fetch effectively is, done once and safely.

## Consequences

- New tables `LinkPreview` (cache, keyed by normalized URL) and
  `MessageLinkPreview` (per-message snapshot), additive migration.
- The SSRF policy is exercised by unit tests on `address-classifier` (every
  blocked range) and `safe-fetch` (redirect handling, size caps, content-type
  rejection), plus an integration test against a local HTTP fixture with the
  `allowPrivateAddresses` escape hatch — never against a real external site.
- Disabled by default: a fresh deployment fetches nothing from the open
  internet on the server's behalf until an owner opts in through
  `link_previews.enabled` (see [admin settings API](admin-settings-api.md)).
- Out of scope, deliberately: a preview does not update once cached content
  expires and a new message is sent with the same URL — each send/edit
  captures its own snapshot, by design (see "message snapshot" above).
