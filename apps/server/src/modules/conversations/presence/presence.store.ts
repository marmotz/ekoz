export type PresenceStatus = 'online' | 'away' | 'offline';

/**
 * Presence state (technical.md §15, issue #10): ephemeral, never persisted.
 * `InProcessPresenceStore` is this increment's implementation; a Redis hash
 * implementation is reserved for multi-instance deployments (same
 * "in-process now, Redis later" pattern as the SSE ticket store).
 */
export interface PresenceStore {
  /** Record a heartbeat for `userId`. `away` set explicitly overrides the derived status. */
  heartbeat(userId: string, explicitAway: boolean): void;
  /** Derived status: `online` within `awayAfterMs`, `away` until `offlineAfterMs`, else `offline`. */
  statusOf(userId: string, awayAfterMs: number, offlineAfterMs: number): PresenceStatus;
}

interface PresenceRecord {
  lastBeat: number;
  explicitAway: boolean;
}

export class InProcessPresenceStore implements PresenceStore {
  private readonly byUser = new Map<string, PresenceRecord>();

  heartbeat(userId: string, explicitAway: boolean): void {
    this.byUser.set(userId, { lastBeat: Date.now(), explicitAway });
  }

  statusOf(userId: string, awayAfterMs: number, offlineAfterMs: number): PresenceStatus {
    const record = this.byUser.get(userId);
    if (!record) {
      return 'offline';
    }

    const elapsed = Date.now() - record.lastBeat;
    if (elapsed >= offlineAfterMs) {
      return 'offline';
    }
    if (record.explicitAway || elapsed >= awayAfterMs) {
      return 'away';
    }

    return 'online';
  }
}

export const PRESENCE_STORE = Symbol('PRESENCE_STORE');
