# Discovery — `GET /.well-known/ekoz`

Every Ekoz server publishes a small, unauthenticated document that lets clients
and peer servers learn how to reach it and how to verify what it signs. It
decouples the identity domain (`name/server`) from the hosting
infrastructure.

## Request

```
GET https://<server-domain>/.well-known/ekoz
```

- No authentication.
- Cacheable: the server sends `Cache-Control: public, max-age=300`. Consumers
  SHOULD honour it and MAY cache longer, but MUST refresh before treating an
  unknown `keyId` on an inbound signature as invalid.

## Response

`200 OK`, `application/json`:

```json
{
  "server": "chat.example",
  "api": "https://api.chat.example",
  "web": "https://chat.example",
  "protocol_versions": ["0"],
  "signing_keys": {
    "9f3c1ad0e2b47a58": {
      "public_key": "b64-raw-ed25519-public-key",
      "valid_from": "2026-08-30T19:15:00.000Z",
      "valid_until": null
    }
  }
}
```

| Field               | Type                     | Notes                                                                              |
| ------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `server`            | string                   | Canonical domain of the instance. Lower-cased public FQDN, never an IP/localhost. |
| `api`               | string (URL)             | Public base URL of the REST/JSON API. May differ from `server`. No trailing `/`.  |
| `web`               | string (URL)             | Public base URL of the reference web client (used for links in emails).           |
| `protocol_versions` | string[]                 | Supported protocol majors, newest-compatible first. Currently `["0"]`.            |
| `signing_keys`      | object<keyId, KeyEntry\> | All currently published Ed25519 keys, keyed by their short `keyId`.               |

### `KeyEntry`

| Field         | Type           | Notes                                                                                       |
| ------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `public_key`  | string         | Raw 32-byte Ed25519 public key, base64.                                                    |
| `valid_from`  | string (ISO)   | When the key became active (UTC ISO-8601).                                                 |
| `valid_until` | string \| null | `null` while the key is active; for a retired key, the end of its overlap window (ISO-8601). |

## Signing keys

- Exactly one key is **active** at any time; new signatures use it.
- On rotation the previous key is **retired** but stays in `signing_keys` until
  `valid_until`, so signatures produced just before the rotation still verify.
- A signature carries the `keyId` it was produced with; verifiers look it up in
  this document. An unknown `keyId` means "refresh the document, then reject".
- Keys are generated at server initialisation, even before federation is
  enabled.
