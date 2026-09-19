import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { effectiveRetentionRuleSchema, retentionRuleSchema } from './retention-rule.js';

// Not wrapped in `createZodDto`: a discriminated union has no single static
// shape for the generated class to extend (TS2509). `ZodValidationPipe`
// accepts a raw `ZodType` just as well — see its doc comment.
export const SetRoomRetentionSchema = retentionRuleSchema;
export type SetRoomRetention = z.infer<typeof SetRoomRetentionSchema>;

/** A room's own rule plus the resolved rule actually applied (technical.md §13). */
export const RoomRetentionViewSchema = z.object({
  rule: retentionRuleSchema,
  effective: effectiveRetentionRuleSchema,
});
export type RoomRetentionView = z.infer<typeof RoomRetentionViewSchema>;
export class RoomRetentionViewDto extends createZodDto(RoomRetentionViewSchema) {}
