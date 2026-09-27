---
"@ekozhq/sdk": minor
---

Add generated types for `GET /me/storage` (`MyStorageViewDto`) and
`POST /files/urls` (`IssueFileUrlsResponseDto`), and a `details` field on
`ProblemDetailsDto` for problem+json errors that carry extra machine-readable
context (e.g. `upload.quota_exceeded`).
