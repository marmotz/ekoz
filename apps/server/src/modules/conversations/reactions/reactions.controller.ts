import { Controller, Delete, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { ReactionParamSchema } from './reactions.dto.js';
import { ReactionsService } from './reactions.service.js';

@ApiTags('Conversations — reactions')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Put('messages/:messageId/reactions/:emoji')
  @HttpCode(204)
  @ApiOperation({ summary: 'React to a message with an emoji (needs room.react).' })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  async add(
    @Param(new ZodValidationPipe(ReactionParamSchema)) params: { messageId: string; emoji: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.reactions.add(principal, params.messageId, params.emoji);
  }

  @Delete('messages/:messageId/reactions/:emoji')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove your reaction from a message (needs room.react).' })
  @ApiProblemResponses({ statuses: [403, 404] })
  async remove(
    @Param(new ZodValidationPipe(ReactionParamSchema)) params: { messageId: string; emoji: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.reactions.remove(principal, params.messageId, params.emoji);
  }
}
