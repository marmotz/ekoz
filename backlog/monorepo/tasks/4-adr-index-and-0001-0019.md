# monorepo — reconcile ADR 0001 / 0019 with 0026

**Status**: todo
**Type**: docs

[ADR 0026](../../../docs/technical/adr/0026-single-monorepo.md) records the
single-monorepo decision. Two earlier ADRs are now partially wrong:

- **0001 Repository layout** — described one repo per component. Strike the
  affected sentences in place, add `-> Superseded by [ADR 0026]` pointers (per
  the ADR README convention). Keep status `accepted`.
- **0019 The backlog lives in the implementing repository** — still true in
  spirit (backlog lives with the code) but "repository" is now "area under
  `backlog/`". Add a clarifying note + pointer to 0026.

Then refresh `docs/technical/adr/README.md` (0026 row already added by this
change; double-check status column).
