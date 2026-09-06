# 0010 — Server initialization and first owner

**Status**: accepted

## Context

The first owner account is created explicitly at initialization. "The first
account created becomes the owner" with no guardrail opens a hijack window: on a
public IP, whoever reaches the admin first becomes the owner.

## Decision

Two mechanisms, in this order of preference:

1. **Non-interactive** (`EKOZ_INITIAL_OWNER_EMAIL` set): only that email can
   create the first owner account (the operator chooses the password on first
   login). If someone slips in, the operator resets the server.
2. **Setup token** (email not set): on first start with no owner, the server
   prints a **single-use token to the logs (stdout)**. Registering the owner
   requires that token.

In both cases, once the first owner exists, the setup endpoint is **closed
permanently** (`410 Gone`).

A server can then have several owners, added from the admin.

## Consequences

- The Docker/compose case is covered with no exposure window (mechanism 1).
- The "manual start" case requires log access = legitimate operator access.
