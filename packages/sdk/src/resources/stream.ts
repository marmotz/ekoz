/**
 * `client.stream`: the per-account SSE stream (`GET /events`) with
 * fresh-ticket reconnection (web-client-chat technical design §5).
 *
 * The stream ticket is single use, so a native `EventSource` auto-retry (which
 * replays the same URL) would fail. Every `error` therefore closes the source
 * and a new attempt mints a fresh ticket after a jittered backoff.
 */

import type { Discovery } from '../discovery/discovery.js';
import type { SessionEventEmitter } from '../session/events.js';
import type { SessionManager } from '../session/session-manager.js';
import { AuthenticationError } from '../transport/errors.js';
import type { RoomEvent } from '../types/events.js';
import type { StreamTicket } from '../types/wire.js';

/** The subset of the DOM `MessageEvent` the stream reads. */
export interface EventSourceMessageLike {
  data: string;
  lastEventId: string;
}

/** The subset of the DOM `EventSource` the stream drives (the SDK builds without the DOM lib). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: EventSourceMessageLike) => void): void;
  close(): void;
}

export type EventSourceConstructor = new (url: string) => EventSourceLike;

export type RoomStreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface RoomStreamRoomEvent {
  roomId: string;
  /** Position in the account feed, from the SSE `id`. Absent when the frame carried none. */
  feedSeq: string | undefined;
  event: RoomEvent;
}

/** `account` frame: account-scoped notification (invitation, join-request outcome, ...). */
export interface AccountStreamEvent {
  roomId: string;
  feedSeq: string | undefined;
  [key: string]: unknown;
}

export interface PresenceStreamEvent {
  userId: string;
  status: 'online' | 'away' | 'offline';
}

export interface TypingStreamEvent {
  roomId: string;
  userId: string;
  ttl: number;
}

export interface RoomStreamEventMap {
  room_event: [event: RoomStreamRoomEvent];
  account: [event: AccountStreamEvent];
  presence: [event: PresenceStreamEvent];
  typing: [event: TypingStreamEvent];
  status: [status: RoomStreamStatus];
  reconnected: [];
}

export type RoomStreamEventName = keyof RoomStreamEventMap;

export interface RoomStream {
  /** Opens the stream; a no-op when already connecting, open or reconnecting. */
  connect(): void;
  disconnect(): void;
  readonly status: RoomStreamStatus;
  on<Name extends RoomStreamEventName>(
    name: Name,
    listener: (...args: RoomStreamEventMap[Name]) => void,
  ): () => void;
}

export interface RoomStreamOptions {
  session: SessionManager;
  discovery: Discovery;
  emitter: SessionEventEmitter;
  /** Defaults to `globalThis.EventSource`, resolved at `connect()`. */
  eventSource?: EventSourceConstructor;
  /** Injectable for tests; defaults to `Math.random`. */
  random?: () => number;
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

// biome-ignore lint/suspicious/noExplicitAny: internal storage only; the public `on` is fully typed.
type AnyListener = (...args: any[]) => void;

class DefaultRoomStream implements RoomStream {
  readonly #options: RoomStreamOptions;
  readonly #listeners = new Map<RoomStreamEventName, Set<AnyListener>>();
  #status: RoomStreamStatus = 'idle';
  #eventSource: EventSourceConstructor | undefined;
  #source: EventSourceLike | undefined;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every `disconnect()`, so an in-flight attempt notices it was cancelled. */
  #generation = 0;
  #failures = 0;
  #hasOpened = false;
  #feedSeq: string | undefined;

  constructor(options: RoomStreamOptions) {
    this.#options = options;
    options.emitter.on('session:invalid', () => this.disconnect());
  }

  get status(): RoomStreamStatus {
    return this.#status;
  }

  on<Name extends RoomStreamEventName>(
    name: Name,
    listener: (...args: RoomStreamEventMap[Name]) => void,
  ): () => void {
    let set = this.#listeners.get(name);
    if (!set) {
      set = new Set();
      this.#listeners.set(name, set);
    }
    set.add(listener as AnyListener);
    return () => {
      this.#listeners.get(name)?.delete(listener as AnyListener);
    };
  }

  connect(): void {
    if (this.#status !== 'idle') return;
    const EventSourceImpl = this.#options.eventSource ?? resolveGlobalEventSource();
    if (!EventSourceImpl) {
      throw new TypeError('No EventSource implementation: pass `eventSource` to createClient');
    }
    this.#eventSource = EventSourceImpl;
    this.#setStatus('connecting');
    void this.#attempt(this.#generation);
  }

  disconnect(): void {
    this.#generation += 1;
    this.#teardown();
    this.#failures = 0;
    this.#hasOpened = false;
    this.#feedSeq = undefined;
    this.#setStatus('idle');
  }

  #emit<Name extends RoomStreamEventName>(name: Name, ...args: RoomStreamEventMap[Name]): void {
    const set = this.#listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      listener(...args);
    }
  }

  #setStatus(status: RoomStreamStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#emit('status', status);
  }

  #teardown(): void {
    if (this.#retryTimer !== undefined) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = undefined;
    }
    this.#source?.close();
    this.#source = undefined;
  }

  async #attempt(generation: number): Promise<void> {
    let url: string;
    try {
      const ticket = await this.#options.session.request<StreamTicket>('POST', '/stream/ticket');
      const baseUrl = await this.#options.discovery.apiBaseUrl();
      url = this.#buildUrl(baseUrl, ticket.ticket);
    } catch (error) {
      if (generation !== this.#generation) return;
      if (error instanceof AuthenticationError) {
        // The `session:invalid` path already handles the consequences.
        this.disconnect();
        return;
      }
      this.#scheduleRetry();
      return;
    }
    if (generation !== this.#generation) return;

    if (!this.#eventSource) return;
    this.#open(new this.#eventSource(url));
  }

  #buildUrl(baseUrl: string, ticket: string): string {
    // Built by hand: `lastEventId` is functional but absent from the OpenAPI description.
    let url = `${baseUrl}/events?ticket=${encodeURIComponent(ticket)}`;
    if (this.#feedSeq !== undefined) {
      url += `&lastEventId=${encodeURIComponent(this.#feedSeq)}`;
    }
    return url;
  }

  #open(source: EventSourceLike): void {
    this.#source = source;

    source.addEventListener('open', () => {
      if (this.#source !== source) return;
      this.#failures = 0;
      const reopened = this.#hasOpened;
      this.#hasOpened = true;
      this.#setStatus('open');
      if (reopened) this.#emit('reconnected');
    });

    source.addEventListener('error', () => {
      if (this.#source !== source) return;
      // Close at once: the native auto-retry would reuse the spent ticket.
      source.close();
      this.#source = undefined;
      this.#scheduleRetry();
    });

    source.addEventListener('room_event', (message) => {
      const data = this.#parse<{ roomId: string } & RoomEvent>(message);
      if (!data) return;
      this.#emit('room_event', {
        roomId: data.roomId,
        feedSeq: this.#trackFeedSeq(message),
        event: data,
      });
    });

    source.addEventListener('account', (message) => {
      const data = this.#parse<{ roomId: string }>(message);
      if (!data) return;
      this.#emit('account', { ...data, feedSeq: this.#trackFeedSeq(message) });
    });

    source.addEventListener('presence', (message) => {
      const data = this.#parse<PresenceStreamEvent>(message);
      if (data) this.#emit('presence', data);
    });

    source.addEventListener('typing', (message) => {
      const data = this.#parse<TypingStreamEvent>(message);
      if (data) this.#emit('typing', data);
    });
  }

  #trackFeedSeq(message: EventSourceMessageLike): string | undefined {
    if (message.lastEventId) this.#feedSeq = message.lastEventId;
    return message.lastEventId || undefined;
  }

  #parse<T>(message: EventSourceMessageLike): T | undefined {
    try {
      return JSON.parse(message.data) as T;
    } catch {
      return undefined;
    }
  }

  #scheduleRetry(): void {
    this.#setStatus('reconnecting');
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.#failures);
    this.#failures += 1;
    const random = this.#options.random ?? Math.random;
    // Jitter within [50%, 100%] of the ceiling.
    const delay = Math.round(ceiling * (0.5 + random() / 2));
    const generation = this.#generation;
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = undefined;
      if (generation !== this.#generation) return;
      void this.#attempt(generation);
    }, delay);
  }
}

function resolveGlobalEventSource(): EventSourceConstructor | undefined {
  return (globalThis as { EventSource?: EventSourceConstructor }).EventSource;
}

export function createRoomStream(options: RoomStreamOptions): RoomStream {
  return new DefaultRoomStream(options);
}
