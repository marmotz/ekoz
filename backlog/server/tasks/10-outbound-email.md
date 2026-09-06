# server — outbound email (SMTP driver)

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#10](https://github.com/ekoz-chat/server/issues/10)

Reference: [../features/server-core/technical.md §7](../features/server-core/technical.md#7-outbound-email).

## To do

1. `Mailer` interface: `send({ to, subject, template, vars, category })`.
2. `smtp` driver on `nodemailer`, configured from `email.smtp.*` / `email.from`.
3. Templates as `{ subject, text, html }` units of `${var}` format strings
   (English, no template engine), wrapped by a shared layout using
   `server.domain` / `server.web_url`. Each is registered by its owning feature
   via `MailService.registerTemplate(name, template)` — `core/mail` ships the
   layout + mechanism, not the message content. `MailService` resolves a
   template through an override seam (owner customization of wording / colours /
   look) that falls back to the registered default; the persistent override
   store + admin surface are deferred to server-administration. A `docs/technical/` page is owed
   for the customization model.
4. `EmailMessage` Prisma model (`id`, `to`, `template`, `category`, `dedupeKey?`
   unique, `sentAt?`, `createdAt`) with a coarse anti-duplication guard.
5. In-process retry queue with backoff; after N attempts log + record
   `email.failed`. No external broker.
6. Dev: verify against Mailpit from `compose.yaml`.

## Dependencies

- [2-prisma-setup](2-prisma-setup.md)
- [4-config-system](4-config-system.md)
