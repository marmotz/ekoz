# Monorepo — follow-ups

Consolidation of `ekoz-chat/{server,sdk-js,client-web,spec}` into `marmotz/ekoz`
is done (history preserved via `git subtree`). Remaining cleanup:

| Done | Task                                                                                          |
| ---- | ------------------------------------------------------------------------------------------- |
| ☐    | [1-rewrite-cross-repo-links](tasks/1-rewrite-cross-repo-links.md) — replace `github.com/ekoz-chat/*` links in `backlog/` and `docs/` with repo-relative paths; re-file the open GitHub issues under `marmotz/ekoz`. |
| ☐    | [2-server-biome-cleanup](tasks/2-server-biome-cleanup.md) — clear the ~23 advisory Biome warnings in `apps/server/src` (literal keys, non-null assertions, template placeholders). |
| ☐    | [3-verify-server-docker](tasks/3-verify-server-docker.md) — `docker build -f apps/server/Dockerfile .` from the repo root and one `http/` smoke request; adjust the multi-stage copy paths if needed. |
| ☐    | [4-adr-index-and-0001-0019](tasks/4-adr-index-and-0001-0019.md) — mark ADR 0001 and 0019 partially superseded by 0026; refresh the ADR README. |
