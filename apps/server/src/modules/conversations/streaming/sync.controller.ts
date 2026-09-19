import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { type SyncQuery, SyncQueryDto, type SyncResponse, SyncResponseDto } from './sync.dto.js';
import { SyncService } from './sync.service.js';

@ApiTags('Conversations — sync')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('sync')
  @ApiOperation({
    summary: 'Per-room catch-up: ordered events since a cursor, plus the current lastSeq.',
  })
  @ApiOkResponse({ type: SyncResponseDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  get(
    @Query(new ZodValidationPipe(SyncQueryDto)) query: SyncQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<SyncResponse> {
    return this.sync.sync(principal, query);
  }
}
