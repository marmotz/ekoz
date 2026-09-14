---
"@ekozhq/sdk": minor
---

Wire `zodGenerator` onto the `api` (OpenAPI) source and re-export the
generated Zod schemas for form validation (`AdminCreateUserBodySchema`,
`LoginBodySchema`, etc.), named `<WireTypeName>Schema` to pair with each
existing wire type (issue #53).
