import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { entityIdSchema } from '../../../core/http/entity-id.schema.js';
import { nullableString } from '../../../core/http/nullable.js';
import type { SessionRecord } from './session.service.js';

/** The client-facing shape of a session (technical.md §11). */
export const SessionViewSchema = z.object({
  id: entityIdSchema,
  deviceName: z.string(),
  /** `true` for the session the calling access token belongs to. */
  current: z.boolean(),
  ip: nullableString(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});

export type SessionView = z.infer<typeof SessionViewSchema>;

/** `GET /sessions` / `PATCH /sessions/:id` session payload. */
export class SessionViewDto extends createZodDto(SessionViewSchema) {}

export function toSessionView(session: SessionRecord, currentSessionId: string): SessionView {
  return {
    id: session.id,
    deviceName: session.deviceName,
    current: session.id === currentSessionId,
    ip: session.ip,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    revokedAt: session.revokedAt,
  };
}
