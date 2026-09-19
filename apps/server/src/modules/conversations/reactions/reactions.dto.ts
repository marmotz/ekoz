import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';

export const ReactionParamSchema = z.object({
  messageId: entityIdSchema,
  emoji: z.string().trim().min(1).max(32),
});
