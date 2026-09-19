import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import type { RoomView } from '../rooms/room.view.js';
import { RoomViewDto } from '../rooms/room.view.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import {
  type DirectoryListResponse,
  DirectoryListResponseDto,
  type DirectoryQuery,
  DirectoryQueryDto,
} from './directory.dto.js';
import { DirectoryService } from './directory.service.js';

@ApiTags('Conversations — directory')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get('directory')
  @ApiOperation({ summary: 'List / search public channel rooms.' })
  @ApiOkResponse({ type: DirectoryListResponseDto })
  @ApiProblemResponses({ validation: true, statuses: [] })
  list(
    @Query(new ZodValidationPipe(DirectoryQueryDto)) query: DirectoryQuery,
  ): Promise<DirectoryListResponse> {
    return this.directory.list(query);
  }

  @Post('rooms/:id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Publish a room to the public directory (needs directory.publish).' })
  @ApiOkResponse({ type: RoomViewDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  publish(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.directory.publish(principal, params.id);
  }

  @Post('rooms/:id/unpublish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Unpublish a room from the public directory (needs directory.publish).',
  })
  @ApiOkResponse({ type: RoomViewDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  unpublish(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.directory.unpublish(principal, params.id);
  }
}
