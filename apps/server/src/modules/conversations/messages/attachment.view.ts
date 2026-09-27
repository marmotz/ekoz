import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableNumber } from '../../../core/http/nullable.js';

/** `MessageAttachment`, as the API exposes it (technical.md §S9, issue #143). */
export const AttachmentViewSchema = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.string(),
  width: nullableNumber(),
  height: nullableNumber(),
  durationMs: nullableNumber(),
  hasThumbnail: z.boolean(),
});
export type AttachmentView = z.infer<typeof AttachmentViewSchema>;
export class AttachmentViewDto extends createZodDto(AttachmentViewSchema) {}

export interface AttachmentRow {
  id: string;
  messageId: string;
  roomId: string;
  blobId: string;
  filename: string;
  contentType: string;
  sizeBytes: bigint;
  position: number;
  uploaderId: string;
  createdAt: string;
}

/** The blob fields an {@link AttachmentView} reads through the join (technical.md §S9). */
export interface AttachmentBlobInfo {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailBlobId: string | null;
}

export function toAttachmentView(
  row: AttachmentRow,
  blob: AttachmentBlobInfo | null,
): AttachmentView {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes.toString(),
    width: blob?.width ?? null,
    height: blob?.height ?? null,
    durationMs: blob?.durationMs ?? null,
    hasThumbnail: blob?.thumbnailBlobId !== null && blob?.thumbnailBlobId !== undefined,
  };
}

/** One item of `GET /rooms/:id/files` (technical.md §S9, issue #143). */
export const RoomFileItemSchema = AttachmentViewSchema.extend({
  messageId: z.string(),
  uploaderId: z.string(),
  createdAt: z.iso.datetime(),
});
export type RoomFileItem = z.infer<typeof RoomFileItemSchema>;
export class RoomFileItemDto extends createZodDto(RoomFileItemSchema) {}

export function toRoomFileItem(row: AttachmentRow, blob: AttachmentBlobInfo | null): RoomFileItem {
  return {
    ...toAttachmentView(row, blob),
    messageId: row.messageId,
    uploaderId: row.uploaderId,
    createdAt: row.createdAt,
  };
}
