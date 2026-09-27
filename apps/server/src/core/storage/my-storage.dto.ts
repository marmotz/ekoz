import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * `GET /me/storage` response (technical.md §S8). Bigints are strings, as `seq`
 * already is. `quotaBytes: null` means unlimited.
 */
export const MyStorageViewSchema = z.object({
  usedBytes: z.string(),
  pendingBytes: z.string(),
  quotaBytes: z.string().nullable(),
});
export type MyStorageView = z.infer<typeof MyStorageViewSchema>;
export class MyStorageViewDto extends createZodDto(MyStorageViewSchema) {}
