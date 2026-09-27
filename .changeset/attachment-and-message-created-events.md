---
"@ekozhq/sdk": minor
---

Type `MessageCreatedEvent.content` with the `attachments` and `linkPreview`
fields the server already sends, and add the `AttachmentRemovedEvent` type
(`attachment_removed`), exported alongside `RawAttachmentTarget` from the
package root — the hand-written room event types had not been updated for
these additive fields (issue #150).
