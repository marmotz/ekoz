import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { OwnerGuard } from '../guards/owner.guard.js';
import { ChangeUsernameSchema, type ChangeUsernameBody } from './username.dto.js';
import { UsernameService, type UsernameChangeOutcome } from './username.service.js';

/** `PATCH /me/username` — policy-driven identifier change (technical.md §17). */
@Controller('me/username')
@UseGuards(AuthGuard)
export class MeUsernameController {
  constructor(private readonly usernames: UsernameService) {}

  @Patch()
  change(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(ChangeUsernameSchema)) body: ChangeUsernameBody
  ): Promise<UsernameChangeOutcome> {
    return this.usernames.changeOwn(principal.userId, body.name);
  }
}

/**
 * Owner review of `approval`-mode identifier changes (technical.md §16, §17).
 */
@Controller('admin/username-requests')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminUsernameRequestsController {
  constructor(private readonly usernames: UsernameService) {}

  @Get()
  list(@Query('status') status?: 'pending' | 'approved' | 'rejected') {
    return this.usernames.listRequests(status);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<{ identifier: string }> {
    return this.usernames.approve(id, principal.userId);
  }

  @Post(':id/reject')
  @HttpCode(204)
  reject(@Param('id') id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.usernames.reject(id, principal.userId);
  }
}
