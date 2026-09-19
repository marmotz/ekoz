import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import {
  type RoomRetentionView,
  RoomRetentionViewDto,
  type SetRoomRetention,
  SetRoomRetentionSchema,
} from './retention.dto.js';
import { RetentionService } from './retention.service.js';

@ApiTags('Conversations — retention')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get('rooms/:id/retention')
  @ApiOperation({ summary: "This room's own retention rule and the resolved effective rule." })
  @ApiOkResponse({ type: RoomRetentionViewDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  getRetention(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomRetentionView> {
    return this.retention.getRetention(principal, params.id);
  }

  @Put('rooms/:id/retention')
  @ApiOperation({
    summary: "Set this room's retention rule (needs room.manage_retention).",
  })
  @ApiOkResponse({ type: RoomRetentionViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  setRetention(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(SetRoomRetentionSchema)) body: SetRoomRetention,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomRetentionView> {
    return this.retention.setRetention(principal, params.id, body);
  }
}
