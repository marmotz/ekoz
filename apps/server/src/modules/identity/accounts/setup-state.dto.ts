import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `GET /setup` response (technical.md §2.4, issue #15). */
export const SetupStateSchema = z.object({
  state: z.enum(['closed', 'email-pinned', 'token-pinned']),
});
export type SetupStateBody = z.infer<typeof SetupStateSchema>;
export class SetupStateDto extends createZodDto(SetupStateSchema) {}
