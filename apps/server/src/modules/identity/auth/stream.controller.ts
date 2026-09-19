import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { type StreamTicketResponse, StreamTicketResponseDto } from './stream.dto.js';
import { TicketService } from './ticket.service.js';

/**
 * SSE stream ticket endpoint (technical.md §12, issue #23). Needs a valid
 * access token; the ticket it returns is what the `GET /events` consumer
 * accepts in its query string.
 */
@ApiTags('Stream')
@ApiBearerAuth('bearer')
@Controller('stream')
@UseGuards(AuthGuard)
export class StreamController {
  constructor(private readonly tickets: TicketService) {}

  @Post('ticket')
  @HttpCode(200)
  @ApiOperation({ summary: 'Issue a single-use ticket for the SSE event stream.' })
  @ApiOkResponse({ type: StreamTicketResponseDto })
  @ApiProblemResponses()
  async issue(@CurrentPrincipal() principal: AuthPrincipal): Promise<StreamTicketResponse> {
    return this.tickets.issue({ userId: principal.userId, sessionId: principal.sessionId });
  }
}
