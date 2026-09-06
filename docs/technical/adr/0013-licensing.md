# 0013 — Licensing

**Status**: accepted

## Context

MIT is permissive but has no patent grant. The AGPL protects against proprietary
SaaS forks but adds friction, a deterrent optic and a CLA to manage. The author
plans to run Ekoz in a SaaS product and targets the broadest possible adoption,
including in closed clients.

## Decision

**Apache-2.0 for the four repositories** (`spec`, `server`, `sdk-js`,
`client-web`).

- `SPDX-License-Identifier: Apache-2.0` header in source files.
- `LICENSE` file (Apache-2.0 text) and `NOTICE` in each repository.

## Consequences

- Explicit patent grant, clear contribution terms.
- Proprietary forks (including competing SaaS) are allowed — a deliberate choice,
  consistent with the commercial use planned by the author.
- No CLA needed for this model.
