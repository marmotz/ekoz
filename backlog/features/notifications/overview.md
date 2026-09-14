# Notifications

**Status**: in discussion

## Context

Users must be informed of relevant events without having to check the web client
constantly.

## Goal

Provide in-app and email notifications, with a base that allows adding other
channels later.

## Decisions made

- The notifiable events of the first increment are direct messages, mentions,
  replies, invitations, moderation actions and new messages in followed rooms.
- An internal notification centre, independent from the delivery channels,
  collects events and applies the notification rules.
- Rules can be defined by the server owner, space administrators and each user.
- User preferences are set globally and can be adjusted per room.
- The server enables the channels it offers; the user picks, among those
  channels, the ones they want to use.
- The adapters shipped are the web app and email (SMTP, modular driver); other
  channels and other email transports can be added without changing the
  notification centre. Emails are in English for now.
- Restrictions defined by the server or a space take precedence over the user's
  preferences.
- The app can notify immediately, then trigger an email notification when the
  event has not been read in the client after a configurable delay. Subsequent
  sends are rate-limited to avoid repetition.
- Security and moderation notifications cannot be disabled by the user and remain
  visible at least in the internal centre.

## Depends on

- [Identity and profiles](../identity-and-profiles/overview.md), for the verified
  email address and user preferences.
- [Conversations](../conversations/overview.md), for events from rooms and
  messages.
- [Server administration](../../_archives/features/server-administration/overview.md), for enabling
  channels and the global rules.

## Feature order

- [Extensibility](../extensibility/overview.md) allows adding delivery adapters.
