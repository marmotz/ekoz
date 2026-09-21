---
"@ekozhq/sdk": minor
---

Add `auth.policy()` (public `GET /auth/policy`) and the `AuthPolicy` type and
`AuthPolicySchema`, so a client can adapt its sign-up flow and password hint to
the server's registration mode, email-verification requirement and minimum
password length (issue #91).
