import { Injectable } from '@nestjs/common';

/** DI token for the {@link StreamTicketStore} implementation. */
export const STREAM_TICKET_STORE = Symbol('STREAM_TICKET_STORE');

/** The `{ userId, sessionId }` a ticket is bound to (technical.md §12). */
export interface StreamTicketBinding {
  userId: string;
  sessionId: string;
}

/**
 * Single-use, short-lived store for SSE stream tickets (technical.md §12, ADR
 * 0008).
 *
 * Keyed by the ticket's SHA-256 hash — the plaintext never lands here. `take`
 * removes the entry, so a ticket can be consumed at most once; expired entries
 * are dropped lazily. The in-process implementation below covers a single
 * instance; a Redis-backed one is the multi-instance upgrade, wired through the
 * {@link STREAM_TICKET_STORE} token.
 */
export interface StreamTicketStore {
  /** Store `binding` under `hash` for `ttlMs` milliseconds. */
  put(hash: string, binding: StreamTicketBinding, ttlMs: number): Promise<void>;
  /** Return and remove the binding for `hash`, or `null` if absent/expired. */
  take(hash: string): Promise<StreamTicketBinding | null>;
}

interface Entry {
  binding: StreamTicketBinding;
  /** Epoch-ms after which the entry is stale. */
  expiresAt: number;
}

/**
 * In-process {@link StreamTicketStore}: a `Map` swept on every write.
 *
 * `put` drops every expired entry before inserting, so an unconsumed ticket
 * cannot linger past its TTL and the map stays bounded by the number of tickets
 * issued within one TTL window — no background timer to leak.
 */
@Injectable()
export class InProcessStreamTicketStore implements StreamTicketStore {
  private readonly entries = new Map<string, Entry>();

  async put(hash: string, binding: StreamTicketBinding, ttlMs: number): Promise<void> {
    this.sweep();
    this.entries.set(hash, { binding, expiresAt: Date.now() + ttlMs });
  }

  async take(hash: string): Promise<StreamTicketBinding | null> {
    const entry = this.entries.get(hash);
    if (!entry) {
      return null;
    }

    this.entries.delete(hash);

    return entry.expiresAt > Date.now() ? entry.binding : null;
  }

  /** Live entry count — for tests and diagnostics. */
  get size(): number {
    return this.entries.size;
  }

  /** Drop every entry whose TTL has elapsed. */
  private sweep(): void {
    const now = Date.now();
    for (const [hash, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(hash);
      }
    }
  }
}
