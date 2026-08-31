import type { SessionRecord } from './session.service.js';

/** The client-facing shape of a session (technical.md §11). */
export interface SessionView {
  id: string;
  deviceName: string;
  /** `true` for the session the calling access token belongs to. */
  current: boolean;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

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
