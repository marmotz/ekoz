import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

export interface PresenceSignal {
  userId: string;
  status: 'online' | 'away' | 'offline';
}

export interface TypingSignal {
  roomId: string;
  userId: string;
  ttl: number;
}

/**
 * In-process pub/sub for signals that must never be persisted (technical.md
 * §15, issue #10): presence and typing. Separate from the durable
 * `AccountFeedEvent` fan-out (#11) — `GET /events` subscribes to both, but
 * only the durable half survives a reconnect via `Last-Event-ID`; a missed
 * ephemeral signal is simply gone, which matches "never in the event log".
 *
 * Both signals are delivered per recipient: the emitter resolves who must
 * receive a signal at emission time, and a connection only listens on its own
 * user's channels.
 */
@Injectable()
export class EphemeralBroadcaster {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  /** Notify `recipientUserId` that `signal.userId`'s presence changed. */
  notifyPresence(recipientUserId: string, signal: PresenceSignal): void {
    this.emitter.emit(`presence:${recipientUserId}`, signal);
  }

  onPresence(userId: string, handler: (signal: PresenceSignal) => void): void {
    this.emitter.on(`presence:${userId}`, handler);
  }

  offPresence(userId: string, handler: (signal: PresenceSignal) => void): void {
    this.emitter.off(`presence:${userId}`, handler);
  }

  /** Notify `recipientUserId` that `signal.userId` is typing in `signal.roomId`. */
  notifyTyping(recipientUserId: string, signal: TypingSignal): void {
    this.emitter.emit(`typing:${recipientUserId}`, signal);
  }

  onTyping(userId: string, handler: (signal: TypingSignal) => void): void {
    this.emitter.on(`typing:${userId}`, handler);
  }

  offTyping(userId: string, handler: (signal: TypingSignal) => void): void {
    this.emitter.off(`typing:${userId}`, handler);
  }
}
