import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { nullableString } from '../../../core/http/nullable.js';
import { RoomFileItemSchema } from './attachment.view.js';
import { MentionInputSchema } from './mention.types.js';
import { MessageViewSchema } from './message.view.js';

/** A body or at least one attachment must remain — enforced by the service (`message.empty`, technical.md §S9). */
export const SendMessageSchema = z.object({
  body: z.string().min(1).optional(),
  replyToId: entityIdSchema.optional(),
  mentions: z.array(MentionInputSchema).max(100).optional(),
  attachments: z.array(entityIdSchema).max(100).optional(),
  linkPreviewUrl: z.url().optional(),
});
export type SendMessage = z.infer<typeof SendMessageSchema>;
export class SendMessageDto extends createZodDto(SendMessageSchema) {}

export const MessageIdParamSchema = z.object({ id: entityIdSchema, messageId: entityIdSchema });
export const MessageAttachmentIdParamSchema = z.object({
  id: entityIdSchema,
  messageId: entityIdSchema,
  attachmentId: entityIdSchema,
});

export const EditAttachmentsSchema = z.object({
  add: z.array(entityIdSchema).max(100).optional(),
  remove: z.array(entityIdSchema).max(100).optional(),
});
export type EditAttachments = z.infer<typeof EditAttachmentsSchema>;

export const EditMessageSchema = z.object({
  body: z.string().min(1).optional(),
  /** Absent: the targets stay as they are. Present: the full new list. */
  mentions: z.array(MentionInputSchema).max(100).optional(),
  attachments: EditAttachmentsSchema.optional(),
  /** Absent: unchanged. A URL: replace/set. `null`: remove the preview. */
  linkPreviewUrl: z.url().nullable().optional(),
});
export type EditMessage = z.infer<typeof EditMessageSchema>;
export class EditMessageDto extends createZodDto(EditMessageSchema) {}

const seqParamSchema = z.string().regex(/^\d+$/, 'Must be a non-negative integer');

export const ListMessagesQuerySchema = z
  .object({
    before: seqParamSchema.optional(),
    after: seqParamSchema.optional(),
    around: seqParamSchema.optional(),
    limit: z.coerce.number().int().min(1).optional(),
  })
  .refine(
    (query) =>
      [query.before, query.after, query.around].filter((value) => value !== undefined).length <= 1,
    { message: 'At most one of "before", "after" and "around" may be set', path: ['before'] },
  );
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
export class ListMessagesQueryDto extends createZodDto(ListMessagesQuerySchema) {}

export const MessagePageSchema = z.object({
  items: z.array(MessageViewSchema),
  lastSeq: z.string(),
  hasMore: z.boolean(),
  hasMoreNewer: z.boolean(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;
export class MessagePageDto extends createZodDto(MessagePageSchema) {}

export const ListFilesQuerySchema = z.object({
  kind: z.enum(['media', 'documents']).optional(),
  before: entityIdSchema.optional(),
  limit: z.coerce.number().int().min(1).optional(),
});
export type ListFilesQuery = z.infer<typeof ListFilesQuerySchema>;
export class ListFilesQueryDto extends createZodDto(ListFilesQuerySchema) {}

export const FilesPageSchema = z.object({
  items: z.array(RoomFileItemSchema),
  nextCursor: nullableString(),
});
export type FilesPage = z.infer<typeof FilesPageSchema>;
export class FilesPageDto extends createZodDto(FilesPageSchema) {}
