import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { DomainError } from '../../../core/http/domain-error.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { RenameSessionSchema, type RenameSessionBody } from './auth.dto.js';
import { SessionService } from './session.service.js';
import { toSessionView, type SessionView } from './session.view.js';

/**
 * Session management (technical.md §11, issue #14). All routes are scoped to the
 * caller and need a valid access token.
 */
@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  async list(@CurrentPrincipal() principal: AuthPrincipal): Promise<SessionView[]> {
    const rows = await this.sessions.listForUser(principal.userId);

    return rows.map((row) => toSessionView(row, principal.sessionId));
  }

  @Patch(':id')
  async rename(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenameSessionSchema)) body: RenameSessionBody
  ): Promise<SessionView> {
    const updated = await this.sessions.rename(principal.userId, id, body.deviceName);

    return toSessionView(updated, principal.sessionId);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentPrincipal() principal: AuthPrincipal, @Param('id') id: string): Promise<void> {
    await this.sessions.revokeOwned(principal.userId, id);
  }

  /** `DELETE /sessions?all=true` — revoke every session except the current one. */
  @Delete()
  async revokeAll(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Query('all') all?: string
  ): Promise<{ revoked: number }> {
    if (all !== 'true') {
      throw new DomainError(
        'identity.sessions_bulk_scope_required',
        'Pass ?all=true to revoke every other session.',
        400
      );
    }

    const revoked = await this.sessions.revokeAllForUser(principal.userId, {
      exceptSessionId: principal.sessionId,
    });

    return { revoked };
  }
}
