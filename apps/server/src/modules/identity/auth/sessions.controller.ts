import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { DomainError } from '../../../core/http/domain-error.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import {
  type RenameSessionBody,
  RenameSessionDto,
  RevokeAllSessionsResponseDto,
} from './auth.dto.js';
import { SessionService } from './session.service.js';
import { type SessionView, SessionViewDto, toSessionView } from './session.view.js';

/**
 * Session management (technical.md §11, issue #14). All routes are scoped to the
 * caller and need a valid access token.
 */
@ApiTags('Sessions')
@ApiBearerAuth('bearer')
@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @ApiOperation({ summary: 'List the calling account’s sessions.' })
  @ApiOkResponse({ type: SessionViewDto, isArray: true })
  @ApiProblemResponses()
  async list(@CurrentPrincipal() principal: AuthPrincipal): Promise<SessionView[]> {
    const rows = await this.sessions.listForUser(principal.userId);

    return rows.map((row) => toSessionView(row, principal.sessionId));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename one session.' })
  @ApiBody({ type: RenameSessionDto })
  @ApiOkResponse({ type: SessionViewDto })
  @ApiProblemResponses({ validation: true, statuses: [404] })
  async rename(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenameSessionDto)) body: RenameSessionBody,
  ): Promise<SessionView> {
    const updated = await this.sessions.rename(principal.userId, id, body.deviceName);

    return toSessionView(updated, principal.sessionId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke one session.' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [404] })
  async revoke(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
  ): Promise<void> {
    await this.sessions.revokeOwned(principal.userId, id);
  }

  /** `DELETE /sessions?all=true` — revoke every session except the current one. */
  @Delete()
  @ApiOperation({ summary: 'Revoke every session except the current one.' })
  @ApiQuery({ name: 'all', required: true, schema: { type: 'string', enum: ['true'] } })
  @ApiOkResponse({ type: RevokeAllSessionsResponseDto })
  @ApiProblemResponses({ statuses: [400] })
  async revokeAll(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query('all') all?: string,
  ): Promise<{ revoked: number }> {
    if (all !== 'true') {
      throw new DomainError(
        'identity.sessions_bulk_scope_required',
        'Pass ?all=true to revoke every other session.',
        400,
      );
    }

    const revoked = await this.sessions.revokeAllForUser(principal.userId, {
      exceptSessionId: principal.sessionId,
    });

    return { revoked };
  }
}
