import { Body, Controller, Post, Put, UseGuards } from '@nestjs/common';
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
  type PresencePreference,
  PresencePreferenceDto,
  type PresencePreferenceResponse,
  PresencePreferenceResponseDto,
} from './presence.dto.js';
import { PresenceService } from './presence.service.js';

@ApiTags('Conversations — presence')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('presence/heartbeat')
  @ApiOperation({
    summary: 'Record a presence heartbeat; returns the status and the client timing settings.',
  })
  @ApiOkResponse({ type: HeartbeatResponseDto })
  @ApiProblemResponses({ validation: true })
  async heartbeat(
    @Body(new ZodValidationPipe(HeartbeatDto)) body: Heartbeat,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<HeartbeatResponse> {
    return this.presence.heartbeat(principal.userId, body.away ?? false, body.clientId);
  }

  @Put('presence/preference')
  @ApiOperation({ summary: 'Persist the manual "appear away" preference.' })
  @ApiOkResponse({ type: PresencePreferenceResponseDto })
  @ApiProblemResponses({ validation: true })
  async setPreference(
    @Body(new ZodValidationPipe(PresencePreferenceDto)) body: PresencePreference,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PresencePreferenceResponse> {
    return this.presence.setManualAway(principal.userId, body.manualAway);
  }
}
