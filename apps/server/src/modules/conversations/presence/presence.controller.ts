import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import {
  type Heartbeat,
  HeartbeatDto,
  type HeartbeatResponse,
  HeartbeatResponseDto,
} from './presence.dto.js';
import { PresenceService } from './presence.service.js';

@ApiTags('Conversations — presence')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('presence/heartbeat')
  @ApiOperation({ summary: 'Record a presence heartbeat; optionally declare yourself away.' })
  @ApiOkResponse({ type: HeartbeatResponseDto })
  @ApiProblemResponses({ validation: true })
  async heartbeat(
    @Body(new ZodValidationPipe(HeartbeatDto)) body: Heartbeat,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<HeartbeatResponse> {
    const status = await this.presence.heartbeat(principal.userId, body.away ?? false);

    return { status };
  }
}
