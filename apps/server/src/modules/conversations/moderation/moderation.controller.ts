import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import { ModerationService } from './moderation.service.js';
import { type ModerationLogEntry, ModerationLogEntryDto } from './moderation-log.view.js';

@ApiTags('Conversations — moderation')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('rooms/:id/moderation-log')
  @ApiOperation({
    summary:
      'Room-scoped view over the audit log, most recent first (needs a moderation capability).',
  })
  @ApiOkResponse({ type: ModerationLogEntryDto, isArray: true })
  @ApiProblemResponses({ statuses: [403, 404] })
  getModerationLog(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ModerationLogEntry[]> {
    return this.moderation.getModerationLog(principal, params.id);
  }
}
