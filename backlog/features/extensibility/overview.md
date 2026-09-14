# Extensibility

**Status**: in discussion

## Context

The server must be able to host new content types and new features without
adding complexity to its core or forcing existing deployments to adopt every
evolution.

## Goal

Design a clear extension model for exchanged content and server behaviour, with
compatibility and security guarantees to be defined.

## Decisions made

- Extensions can bring content types, outbound or inbound integrations,
  notification channels and client features.
- Only the server owner can install and enable an extension.
- Any third-party extension must be explicitly approved by the owner before it is
  enabled.
- The owner explicitly grants each extension the minimal permissions it needs.
- A failing or unavailable extension must not interrupt the operation of the
  server core or native messaging.
- A client that does not support an extension content type renders it with a
  standard fallback, without blocking the conversation.
- An extension content type received through federation also uses the fallback
  rendering when the extension is not installed locally.
- Only the owner decides to update or disable an installed extension.

## Depends on

- [Server administration](../../_archives/features/server-administration/overview.md), for installing,
  approving and enabling extensions.
- [Federation](../federation/overview.md), for exchanging extension content with
  peer servers.
