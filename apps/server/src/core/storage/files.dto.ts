import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { FileRefSchema } from './file-ref.js';

/** `POST /files/urls` body (technical.md §S6): up to 100 refs at once. */
export const IssueFileUrlsSchema = z.object({
  items: z.array(FileRefSchema).min(1).max(100),
});
export type IssueFileUrlsBody = z.infer<typeof IssueFileUrlsSchema>;
export class IssueFileUrlsDto extends createZodDto(IssueFileUrlsSchema) {}

/** One entry of the `POST /files/urls` response: issued, or denied with a code. */
export const FileUrlResultSchema = z.union([
  z.object({ ref: FileRefSchema, url: z.string(), expiresAt: z.string() }),
  z.object({ ref: FileRefSchema, error: z.string() }),
]);
export type FileUrlResult = z.infer<typeof FileUrlResultSchema>;

export const IssueFileUrlsResponseSchema = z.object({ items: z.array(FileUrlResultSchema) });
export type IssueFileUrlsResponse = z.infer<typeof IssueFileUrlsResponseSchema>;
export class IssueFileUrlsResponseDto extends createZodDto(IssueFileUrlsResponseSchema) {}
