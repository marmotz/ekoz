export type PresenceStatus = 'online' | 'away' | 'offline';

/** Slot used by heartbeats that carry no `clientId`. */
export const DEFAULT_CLIENT_ID = 'default';

/**
 * Presence state (technical.md §15, issue #10): ephemeral, never persisted
 * (except the manual-away preference, which is only cached here).
 * `InProcessPresenceStore` is this increment's implementation; a Redis hash
 * implementation is reserved for multi-instance deployments (same
 * "in-process now, Redis later" pattern as the SSE ticket store).
 *
 * State is kept per client instance (`clientId`): a user with an idle tab and
 * an active one is `online`, not whichever beat came last.
 */
export interface PresenceStore {
  /** Record a heartbeat from one client instance of `userId`. */
  heartbeat(userId: string, clientId: string, idle: boolean): void;
  /**
   * Derived status, evaluated now:
   * 1. no record fresher than `offlineAfterMs` → `offline`;
   * 2. manual away → `away`;
   * 3. a non-idle record fresher than `awayAfterMs` → `online`;
   * 4. otherwise → `away`.
   */
  statusOf(userId: string, awayAfterMs: number, offlineAfterMs: number): PresenceStatus;
  /** The cached manual-away preference, `undefined` until first loaded or set. */
  manualAwayOf(userId: string): boolean | undefined;
  setManualAway(userId: string, manualAway: boolean): void;
  /** The last status pushed to peers, `undefined` when none was pushed yet. */
  lastEmitted(userId: string): PresenceStatus | undefined;
  markEmitted(userId: string, status: PresenceStatus): void;
  /** Every user the store currently tracks. */
  userIds(): string[];
  /**
   * Drop records older than `offlineAfterMs`, then drop users left with no
   * record whose last emitted status is `offline` (or was never emitted).
   */
  prune(offlineAfterMs: number): void;
}

interface ClientRecord {
  lastBeat: number;
  idle: boolean;
}

interface UserState {
  clients: Map<string, ClientRecord>;
  manualAway?: boolean;
  lastEmitted?: PresenceStatus;
}

export class InProcessPresenceStore implements PresenceStore {
  private readonly byUser = new Map<string, UserState>();

  heartbeat(userId: string, clientId: string, idle: boolean): void {
    this.stateOf(userId).clients.set(clientId, { lastBeat: Date.now(), idle });
  }

  statusOf(userId: string, awayAfterMs: number, offlineAfterMs: number): PresenceStatus {
    const state = this.byUser.get(userId);
    if (!state) {
      return 'offline';
    }

    const now = Date.now();
    const fresh = [...state.clients.values()].filter(
      (record) => now - record.lastBeat < offlineAfterMs,
    );
    if (fresh.length === 0) {
      return 'offline';
    }
    if (state.manualAway) {
      return 'away';
    }

    return fresh.some((record) => !record.idle && now - record.lastBeat < awayAfterMs)
      ? 'online'
      : 'away';
  }

  manualAwayOf(userId: string): boolean | undefined {
    return this.byUser.get(userId)?.manualAway;
  }

  setManualAway(userId: string, manualAway: boolean): void {
    this.stateOf(userId).manualAway = manualAway;
  }

  lastEmitted(userId: string): PresenceStatus | undefined {
    return this.byUser.get(userId)?.lastEmitted;
  }

  markEmitted(userId: string, status: PresenceStatus): void {
    this.stateOf(userId).lastEmitted = status;
  }

  userIds(): string[] {
    return [...this.byUser.keys()];
  }

  prune(offlineAfterMs: number): void {
    const now = Date.now();

    for (const [userId, state] of this.byUser) {
      for (const [clientId, record] of state.clients) {
        if (now - record.lastBeat >= offlineAfterMs) {
          state.clients.delete(clientId);
        }
      }
      if (state.clients.size === 0 && (state.lastEmitted ?? 'offline') === 'offline') {
        this.byUser.delete(userId);
      }
    }
  }

  private stateOf(userId: string): UserState {
    let state = this.byUser.get(userId);
    if (!state) {
      state = { clients: new Map() };
      this.byUser.set(userId, state);
    }

    return state;
  }
}

export const PRESENCE_STORE = Symbol('PRESENCE_STORE');
