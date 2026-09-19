import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { nullableString } from '../../../core/http/nullable.js';

/** One `audit_log` row, as the moderation log exposes it (technical.md §17). */
export const ModerationLogEntrySchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  actorUserId: nullableString(),
  action: z.string(),
  targetType: nullableString(),
  targetId: nullableString(),
  metadata: z.record(z.string(), z.unknown()),
});
export type ModerationLogEntry = z.infer<typeof ModerationLogEntrySchema>;
export class ModerationLogEntryDto extends createZodDto(ModerationLogEntrySchema) {}
