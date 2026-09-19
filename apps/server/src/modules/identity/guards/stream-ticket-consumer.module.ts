import { Global, Module } from '@nestjs/common';
import { STREAM_TICKET_CONSUMER } from '../../../core/http/stream-ticket-consumer.js';
import { TicketService } from '../auth/ticket.service.js';
import { IdentityModule } from '../identity.module.js';

/**
 * Binds `core/http`'s `STREAM_TICKET_CONSUMER` seam to identity's real
 * `TicketService` — same pattern as `PrincipalAuthenticatorModule` for
 * `PRINCIPAL_AUTHENTICATOR`.
 *
 * `@Global()` so the conversations feature's `GET /events` controller can
 * resolve this token without importing the identity feature module directly
 * (`boundaries/dependencies`, `eslint.config.mjs`).
 */
@Global()
@Module({
  imports: [IdentityModule],
  providers: [{ provide: STREAM_TICKET_CONSUMER, useExisting: TicketService }],
  exports: [STREAM_TICKET_CONSUMER],
})
export class StreamTicketConsumerModule {}
