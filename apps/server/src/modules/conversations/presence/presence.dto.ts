import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const HeartbeatSchema = z.object({ away: z.boolean().optional() });
export type Heartbeat = z.infer<typeof HeartbeatSchema>;
export class HeartbeatDto extends createZodDto(HeartbeatSchema) {}

export const PresenceStatusSchema = z.enum(['online', 'away', 'offline']);

export const HeartbeatResponseSchema = z.object({ status: PresenceStatusSchema });
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
export class HeartbeatResponseDto extends createZodDto(HeartbeatResponseSchema) {}
