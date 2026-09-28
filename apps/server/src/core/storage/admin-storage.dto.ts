import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../http/entity-id.schema.js';
import { nullableString } from '../http/nullable.js';
import { UserSummarySchema } from '../users/user-summary.js';

/** `GET /admin/users/:id/storage` (technical.md §S11, issue #146). */
export const AdminUserStorageViewSchema = z.object({
  usedBytes: z.string(),
  pendingBytes: z.string(),
  quotaBytes: nullableString(),
  /** `true` when the user has a `StorageQuotaOverride` row (a `null` override still counts). */
  overridden: z.boolean(),
});
export type AdminUserStorageView = z.infer<typeof AdminUserStorageViewSchema>;
export class AdminUserStorageViewDto extends createZodDto(AdminUserStorageViewSchema) {}

export const SetUserStorageQuotaSchema = z.object({
  quotaBytes: z.string().regex(/^\d+$/, 'Must be a non-negative integer').nullable(),
});
export type SetUserStorageQuota = z.infer<typeof SetUserStorageQuotaSchema>;
export class SetUserStorageQuotaDto extends createZodDto(SetUserStorageQuotaSchema) {}

/** One row of `GET /admin/storage`'s `topConsumers`. */
export const TopConsumerSchema = z.object({
  user: UserSummarySchema,
  usedBytes: z.string(),
});
export type TopConsumer = z.infer<typeof TopConsumerSchema>;

/** `GET /admin/storage` (technical.md §S11, issue #146). */
export const AdminStorageDashboardSchema = z.object({
  usedBytes: z.string(),
  capacityBytes: nullableString(),
  blobCount: z.number().int(),
  pendingUploads: z.number().int(),
  topConsumers: z.array(TopConsumerSchema),
  driver: z.enum(['local', 's3']),
  mediaTools: z.object({
    available: z.boolean(),
    ffmpegVersion: nullableString(),
  }),
});
export type AdminStorageDashboard = z.infer<typeof AdminStorageDashboardSchema>;
export class AdminStorageDashboardDto extends createZodDto(AdminStorageDashboardSchema) {}

/** `GET /admin/attachments` query (technical.md §S11, issue #146). */
export const AdminAttachmentsQuerySchema = z.object({
  q: z.string().optional(),
  uploaderId: entityIdSchema.optional(),
  roomId: entityIdSchema.optional(),
  type: z.enum(['media', 'documents']).optional(),
  before: entityIdSchema.optional(),
  limit: z.coerce.number().int().min(1).optional(),
});
export type AdminAttachmentsQuery = z.infer<typeof AdminAttachmentsQuerySchema>;
export class AdminAttachmentsQueryDto extends createZodDto(AdminAttachmentsQuerySchema) {}

/** One item of `GET /admin/attachments`. */
export const AdminAttachmentItemSchema = z.object({
  id: z.string(),
  /** The underlying `Blob.id`, target of `DELETE /admin/blobs/:id`. */
  blobId: z.string(),
  /** `Blob.refCount`: how many attachments, link previews and avatars share this blob. */
  refCount: z.number().int(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.string(),
  createdAt: z.iso.datetime(),
  room: z.object({ id: z.string(), name: nullableString() }),
  message: z.object({ id: z.string() }),
  uploader: UserSummarySchema,
});
export type AdminAttachmentItem = z.infer<typeof AdminAttachmentItemSchema>;
export class AdminAttachmentItemDto extends createZodDto(AdminAttachmentItemSchema) {}

export const AdminAttachmentsPageSchema = z.object({
  items: z.array(AdminAttachmentItemSchema),
  nextCursor: nullableString(),
});
export type AdminAttachmentsPage = z.infer<typeof AdminAttachmentsPageSchema>;
export class AdminAttachmentsPageDto extends createZodDto(AdminAttachmentsPageSchema) {}
