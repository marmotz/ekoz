import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service.js';
import { sha256Hex } from '../../../core/crypto/hashing.js';
import {
  STREAM_TICKET_STORE,
  type StreamTicketBinding,
  type StreamTicketStore,
} from './stream-ticket.store.js';

/** Result of {@link TicketService.issue}: the plaintext ticket and its TTL. */
export interface IssuedStreamTicket {
  ticket: string;
  /** Seconds until the ticket expires. */
  expiresIn: number;
}

/**
 * SSE stream tickets (technical.md §12, ADR 0008).
 *
 * `POST /stream/ticket` hands the caller a 32-byte opaque token bound to their
 * `{ userId, sessionId }`. The `GET /events` consumer built with the
 * conversations feature calls {@link consume} exactly once to trade the ticket
 * for that binding before it opens the stream.
 */
@Injectable()
export class TicketService {
  constructor(
    @Inject(STREAM_TICKET_STORE) private readonly store: StreamTicketStore,
    private readonly config: ConfigService,
  ) {}

  /** Mint a single-use ticket for `binding`. Returns the plaintext once. */
  async issue(binding: StreamTicketBinding): Promise<IssuedStreamTicket> {
    const ticket = randomBytes(32).toString('base64url');
    const expiresIn = this.config.get('auth.stream_ticket_ttl');

    await this.store.put(sha256Hex(ticket), binding, expiresIn * 1000);

    return { ticket, expiresIn };
  }

  /**
   * Trade `ticket` for its binding, consuming it. Returns `null` when the ticket
   * is unknown, already used or expired.
   */
  async consume(ticket: string): Promise<StreamTicketBinding | null> {
    return this.store.take(sha256Hex(ticket));
  }
}
