import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { type ListMyMentionsQuery, ListMyMentionsQueryDto } from './mentions.dto.js';
import { MentionsService } from './mentions.service.js';
import {
  type MyMentionsPage,
  MyMentionsPageDto,
  type UnreadMentionsView,
  UnreadMentionsViewDto,
} from './mentions.view.js';

@ApiTags('Conversations — mentions')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class MentionsController {
  constructor(private readonly mentions: MentionsService) {}

  @Get('me/mentions/unread')
  @ApiOperation({
    summary: 'Unread mention counters per room, direct and collective, for every room type.',
  })
  @ApiOkResponse({ type: UnreadMentionsViewDto })
  @ApiProblemResponses({})
  unread(@CurrentPrincipal() principal: AuthPrincipal): Promise<UnreadMentionsView> {
    return this.mentions.unread(principal);
  }

  @Get('me/mentions')
  @ApiOperation({ summary: 'The messages that concern the caller, most recent mention first.' })
  @ApiOkResponse({ type: MyMentionsPageDto })
  @ApiProblemResponses({ validation: true })
  list(
    @Query(new ZodValidationPipe(ListMyMentionsQueryDto)) query: ListMyMentionsQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MyMentionsPage> {
    return this.mentions.list(principal, query);
  }
}
