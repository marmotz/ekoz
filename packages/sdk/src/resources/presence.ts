/**
 * `client.presence`: heartbeat, manual away, typing signal, and the heartbeat
 * loop of this client instance (web-client-presence-and-typing technical
 * design section 3).
 */

import type { SessionEventEmitter } from '../session/events.js';
import type { SessionManager } from '../session/session-manager.js';
import type { HeartbeatResponse, PresencePreferenceResponse } from '../types/wire.js';

export type PresenceStatus = 'online' | 'away' | 'offline';

export interface HeartbeatBody {
  /** Declares this client instance idle (no recent user activity). */
  away?: boolean;
  /** Identifies this client instance (1-64 chars); absent = one shared slot. */
  clientId?: string;
}

export interface PresenceState {
  status: PresenceStatus;
  manualAway: boolean;
}

export interface PresenceReporter {
  /** Beats immediately, then every `heartbeatInterval` of the last response. */
  start(): void;
  stop(): void;
  /**
   * Stops the loop after one last heartbeat declaring this instance idle, so the user
   * appears away at once instead of lingering online. Call it before a voluntary
   * sign-out, while the session is still valid; failures are swallowed.
   */
  signOff(): Promise<void>;
  /** Declares this client idle or active; beats immediately when the value changes. */
  setIdle(idle: boolean): void;
  /** Persists the manual "appear away" preference and updates `state`. */
  setManualAway(away: boolean): Promise<void>;
  /** Throttled typing signal: at most one POST per room every `typingTtl / 2`; failures are swallowed. */
  notifyTyping(roomId: string): void;
  /** The last status and manual away flag the server reported, `null` before the first response. */
  readonly state: PresenceState | null;
  on(name: 'change', listener: () => void): () => void;
}

export interface PresenceResource {
  heartbeat(body?: HeartbeatBody): Promise<HeartbeatResponse>;
  setManualAway(manualAway: boolean): Promise<PresencePreferenceResponse>;
  typing(roomId: string): Promise<void>;
  /** Heartbeat loop for this client instance. */
  readonly reporter: PresenceReporter;
}

/** Used until the first heartbeat response tells the real values (server defaults). */
const DEFAULT_HEARTBEAT_INTERVAL_S = 45;
const DEFAULT_TYPING_TTL_S = 6;

function randomClientId(): string {
  const cryptoImpl = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoImpl?.randomUUID?.() ?? Math.random().toString(36).slice(2, 18);
}

class DefaultPresenceReporter implements PresenceReporter {
  readonly #resource: Pick<PresenceResource, 'heartbeat' | 'setManualAway' | 'typing'>;
  readonly #clientId = randomClientId();
  readonly #listeners = new Set<() => void>();
  readonly #lastTypingAt = new Map<string, number>();
  #running = false;
  #idle = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every beat and by `stop()`, so a superseded beat does not reschedule. */
  #beatId = 0;
  #intervalMs = DEFAULT_HEARTBEAT_INTERVAL_S * 1000;
  #typingTtlMs = DEFAULT_TYPING_TTL_S * 1000;
  #state: PresenceState | null = null;

  constructor(
    resource: Pick<PresenceResource, 'heartbeat' | 'setManualAway' | 'typing'>,
    emitter: SessionEventEmitter,
  ) {
    this.#resource = resource;
    emitter.on('session:invalid', () => this.stop());
  }

  get state(): PresenceState | null {
    return this.#state;
  }

  on(_name: 'change', listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    void this.#beat();
  }

  stop(): void {
    this.#running = false;
    this.#beatId += 1;
    this.#clearTimer();
  }

  async signOff(): Promise<void> {
    if (!this.#running) return;
    this.stop();
    try {
      await this.#resource.heartbeat({ away: true, clientId: this.#clientId });
    } catch {
      // Signing out must not fail because the last beat did not get through.
    }
  }

  setIdle(idle: boolean): void {
    if (this.#idle === idle) return;
    this.#idle = idle;
    if (this.#running) void this.#beat();
  }

  async setManualAway(away: boolean): Promise<void> {
    const response = await this.#resource.setManualAway(away);
    this.#apply({ status: response.status, manualAway: response.manualAway });
  }

  notifyTyping(roomId: string): void {
    const now = Date.now();
    const last = this.#lastTypingAt.get(roomId);
    if (last !== undefined && now - last < this.#typingTtlMs / 2) return;
    this.#lastTypingAt.set(roomId, now);
    this.#resource.typing(roomId).catch(() => undefined);
  }

  async #beat(): Promise<void> {
    this.#clearTimer();
    this.#beatId += 1;
    const beatId = this.#beatId;
    try {
      const response = await this.#resource.heartbeat({
        away: this.#idle,
        clientId: this.#clientId,
      });
      this.#intervalMs = response.heartbeatInterval * 1000;
      this.#typingTtlMs = response.typingTtl * 1000;
      this.#apply({ status: response.status, manualAway: response.manualAway });
    } catch {
      // A failed beat is retried at the next tick.
    }
    if (this.#running && beatId === this.#beatId) {
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        void this.#beat();
      }, this.#intervalMs);
    }
  }

  #apply(next: PresenceState): void {
    const previous = this.#state;
    // Keep the same object while nothing changed, so a reader can use it as a snapshot.
    if (previous?.status === next.status && previous.manualAway === next.manualAway) return;
    this.#state = next;
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }
}

export function createPresenceResource(
  session: SessionManager,
  emitter: SessionEventEmitter,
): PresenceResource {
  const resource = {
    heartbeat(body: HeartbeatBody = {}) {
      return session.request<HeartbeatResponse>('POST', '/presence/heartbeat', { body });
    },

    setManualAway(manualAway: boolean) {
      return session.request<PresencePreferenceResponse>('PUT', '/presence/preference', {
        body: { manualAway },
      });
    },

    async typing(roomId: string) {
      await session.request<void>('POST', `/rooms/${encodeURIComponent(roomId)}/typing`);
    },
  };

  return { ...resource, reporter: new DefaultPresenceReporter(resource, emitter) };
}
