import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { TicketService } from './ticket.service.js';

/**
 * SSE stream ticket endpoint (technical.md §12, issue #23). Needs a valid
 * access token; the ticket it returns is what the `GET /events` consumer
 * accepts in its query string.
 */
@Controller('stream')
@UseGuards(AuthGuard)
export class StreamController {
  constructor(private readonly tickets: TicketService) {}

  @Post('ticket')
  @HttpCode(200)
  async issue(
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<{ ticket: string; expiresIn: number }> {
    return this.tickets.issue({ userId: principal.userId, sessionId: principal.sessionId });
  }
}
