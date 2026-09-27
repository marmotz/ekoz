import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../http/nullable.js';

/** `LinkPreview`, as `POST /link-previews` and a message's `linkPreview` expose it (technical.md §S10). */
export const LinkPreviewViewSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: nullableString(),
  description: nullableString(),
  siteName: nullableString(),
  hasImage: z.boolean(),
});
export type LinkPreviewView = z.infer<typeof LinkPreviewViewSchema>;
export class LinkPreviewViewDto extends createZodDto(LinkPreviewViewSchema) {}

export interface LinkPreviewRow {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageBlobId: string | null;
  status: 'ready' | 'failed';
  fetchedAt: string;
}

export function toLinkPreviewView(row: LinkPreviewRow): LinkPreviewView {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    siteName: row.siteName,
    hasImage: row.imageBlobId !== null,
  };
}

/** Whether a resolved preview has anything worth showing (technical.md §S10: `204` otherwise). */
export function isEmptyPreview(row: LinkPreviewRow): boolean {
  return row.title === null && row.description === null && row.imageBlobId === null;
}

/** A message's `linkPreview` snapshot (`MessageLinkPreview`, technical.md §S10). */
export interface MessageLinkPreviewRow {
  messageId: string;
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageBlobId: string | null;
}

export function toMessageLinkPreviewView(row: MessageLinkPreviewRow): LinkPreviewView {
  return {
    id: row.messageId,
    url: row.url,
    title: row.title,
    description: row.description,
    siteName: row.siteName,
    hasImage: row.imageBlobId !== null,
  };
}
