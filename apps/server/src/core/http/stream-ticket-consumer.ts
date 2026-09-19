/** The `{ userId, sessionId }` a stream ticket resolves to, once consumed. */
export interface StreamTicketBinding {
  userId: string;
  sessionId: string;
}

/**
 * Seam between `GET /events` (built with the conversations feature) and
 * identity's `TicketService`, which actually mints and stores the tickets
 * (`docs/technical/shared-auth-guard.md` describes the same pattern for
 * `PRINCIPAL_AUTHENTICATOR`).
 */
export interface StreamTicketConsumer {
  /** Trade `ticket` for its binding, consuming it. `null` if unknown/used/expired. */
  consume(ticket: string): Promise<StreamTicketBinding | null>;
}

/** DI token for the active {@link StreamTicketConsumer}. */
export const STREAM_TICKET_CONSUMER = Symbol('STREAM_TICKET_CONSUMER');
