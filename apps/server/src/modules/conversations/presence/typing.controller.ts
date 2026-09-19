import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import { TypingService } from './typing.service.js';

@ApiTags('Conversations — presence')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class TypingController {
  constructor(private readonly typing: TypingService) {}

  @Post('rooms/:id/typing')
  @HttpCode(204)
  @ApiOperation({ summary: 'Broadcast a typing signal to the room (needs room.post).' })
  @ApiProblemResponses({ statuses: [403, 404] })
  async broadcast(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.typing.broadcastTyping(principal, params.id);
  }
}
