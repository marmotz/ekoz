import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { type RoomView, RoomViewDto } from '../rooms/room.view.js';
import { type ConversationListResponse, ConversationListResponseDto } from './conversation.view.js';
import { ConversationListService } from './conversation-list.service.js';
import { type CreateDm, CreateDmDto, type CreateGroupDm, CreateGroupDmDto } from './dm.dto.js';
import { DmService } from './dm.service.js';

@ApiTags('Conversations — dm')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class DmController {
  constructor(
    private readonly dm: DmService,
    private readonly conversations: ConversationListService,
  ) {}

  @Get('me/conversations')
  @ApiOperation({ summary: "List the caller's direct and group conversations." })
  @ApiOkResponse({ type: ConversationListResponseDto })
  @ApiProblemResponses()
  listConversations(
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ConversationListResponse> {
    return this.conversations.listMine(principal);
  }

  @Post('dms')
  @ApiBody({ type: CreateDmDto })
  @ApiOperation({ summary: 'Get or create a direct conversation with a user.' })
  @ApiCreatedResponse({ type: RoomViewDto })
  @ApiProblemResponses({ validation: true, statuses: [422] })
  createDm(
    @Body(new ZodValidationPipe(CreateDmDto)) body: CreateDm,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.dm.createDm(principal, body);
  }

  @Post('group-dms')
  @ApiBody({ type: CreateGroupDmDto })
  @ApiOperation({ summary: 'Create a group conversation.' })
  @ApiCreatedResponse({ type: RoomViewDto })
  @ApiProblemResponses({ validation: true, statuses: [] })
  createGroupDm(
    @Body(new ZodValidationPipe(CreateGroupDmDto)) body: CreateGroupDm,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.dm.createGroupDm(principal, body);
  }
}
