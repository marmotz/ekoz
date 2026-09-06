---
"@ekozhq/sdk": minor
---

Bootstrap the package: build/test/lint tooling (tsdown dual ESM+CJS, Vitest,
ESLint flat config, Changesets, CI), the HTTP transport core (`HttpClient` with
`X-Request-Id` / `X-Ekoz-Protocol` headers and centralised `problem+json`
decoding), the typed error hierarchy (`EkozError` and subclasses), and discovery
resolution (`/.well-known/ekoz`) with the protocol-version compatibility guard.
