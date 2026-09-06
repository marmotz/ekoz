# 0015 — Decisions are recorded as ADRs

**Status**: accepted

## Context

The project is in a scoping phase; many structuring choices are made through
discussion. Without a record, the "why" is lost and decisions get re-litigated.
The first decisions were already written as ADRs (0001–0014) and the format
proved useful.

## Decision

Every design decision or notable change to the project is recorded in an ADR
under `spec/docs/technical/adr/`, regardless of which repository is concerned.

- This covers: a new choice, a change to an existing choice, the rejection of an
  option that was considered.
- Short MADR-inspired format: **Context**, **Decision**, **Consequences**. Short
  and readable; implementation detail goes in the code and its docs.
- Sequential numbering, never reused. An ADR is not deleted: when it is
  superseded, its status becomes `superseded by NNNN` and the new ADR references
  the old one.
- The ADR is written at the time of the decision.
- The `adr/README.md` index is kept up to date.
- Code repositories (`server`, `sdk-js`, `client-web`) do not duplicate ADRs:
  they reference them by number. Their `AGENTS.md` restates the rule.

## Consequences

- A small overhead per decision, offset by traceability and onboarding.
- Reviews also check "is the ADR present and correct?".
- Product discussions keep feeding the server backlog (`overview.md` per feature); the ADR
  captures the design/technical side.
