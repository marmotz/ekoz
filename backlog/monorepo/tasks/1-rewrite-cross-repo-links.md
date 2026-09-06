# monorepo — rewrite cross-repo links

**Status**: todo
**Type**: chore

The four source repos (`ekoz-chat/server`, `sdk-js`, `client-web`, `spec`) were
merged into `marmotz/ekoz`. Their task files and docs still link to
`https://github.com/ekoz-chat/<repo>/...` and to now-closed GitHub issues.

## To do

1. In `backlog/**` and `docs/**`, replace:
   - `github.com/ekoz-chat/spec/blob/main/docs/<x>` -> repo-relative `docs/<x>`
     (or a correct `../` path from the file's location).
   - `github.com/ekoz-chat/server/blob/main/backlog/<x>` -> `backlog/server/<x>`,
     same for `sdk-js` -> `backlog/sdk`, `client-web` -> `backlog/client-web`.
   - `github.com/ekoz-chat/<repo>/issues/<n>` -> keep as historical text, or
     re-file under `marmotz/ekoz` and point to the new number.
2. Decide issue strategy: re-create the still-open issues in `marmotz/ekoz`
   (prefix titles with the area, e.g. `server:`), or drop issue links and track
   purely from `todo.md`.
3. Update each area `todo.md` intro paragraph (the "sibling repositories carry
   their own backlogs" wording no longer applies).

## Out of scope

- Any change to task content itself.
