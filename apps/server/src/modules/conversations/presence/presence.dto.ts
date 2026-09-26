import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const HeartbeatSchema = z.object({
  away: z.boolean().optional(),
  clientId: z.string().min(1).max(64).optional(),
});
export type Heartbeat = z.infer<typeof HeartbeatSchema>;
export class HeartbeatDto extends createZodDto(HeartbeatSchema) {}

export const PresenceStatusSchema = z.enum(['online', 'away', 'offline']);

export const HeartbeatResponseSchema = z.object({
  status: PresenceStatusSchema,
  manualAway: z.boolean(),
  /** Seconds between two heartbeats the client should keep. */
  heartbeatInterval: z.number().int(),
  /** Seconds a typing signal stays valid. */
  typingTtl: z.number().int(),
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
export class HeartbeatResponseDto extends createZodDto(HeartbeatResponseSchema) {}

export const PresencePreferenceSchema = z.object({ manualAway: z.boolean() });
export type PresencePreference = z.infer<typeof PresencePreferenceSchema>;
export class PresencePreferenceDto extends createZodDto(PresencePreferenceSchema) {}

export const PresencePreferenceResponseSchema = z.object({
  status: PresenceStatusSchema,
  manualAway: z.boolean(),
});
export type PresencePreferenceResponse = z.infer<typeof PresencePreferenceResponseSchema>;
export class PresencePreferenceResponseDto extends createZodDto(PresencePreferenceResponseSchema) {}
