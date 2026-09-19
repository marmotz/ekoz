import { z } from 'zod';
import { durationSeconds } from '../../../core/config/registry.js';

/**
 * Retention rule shape (technical.md §3, §13, retention-and-tombstones.md,
 * issue #12). A room/space rule may also be `inherit` (the DB default on
 * creation); `retention.default` (the server fallback) cannot, so the
 * resolved effective rule is always {@link EffectiveRetentionRuleSchema}.
 */
export const retentionRuleSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('inherit') }),
  z.object({ mode: z.literal('keep') }),
  z.object({ mode: z.literal('hide'), after: durationSeconds }),
  z.object({ mode: z.literal('delete'), after: durationSeconds }),
]);
export type RetentionRule = z.infer<typeof retentionRuleSchema>;

export const effectiveRetentionRuleSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('keep') }),
  z.object({ mode: z.literal('hide'), after: durationSeconds }),
  z.object({ mode: z.literal('delete'), after: durationSeconds }),
]);
export type EffectiveRetentionRule = z.infer<typeof effectiveRetentionRuleSchema>;
