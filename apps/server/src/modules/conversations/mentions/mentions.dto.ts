import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListMyMentionsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});
export type ListMyMentionsQuery = z.infer<typeof ListMyMentionsQuerySchema>;
export class ListMyMentionsQueryDto extends createZodDto(ListMyMentionsQuerySchema) {}
