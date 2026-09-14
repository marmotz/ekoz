import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { OwnerGuard } from '../guards/owner.guard.js';
import {
  type AdminUserDetail,
  AdminUserDetailDto,
  type AdminUserListQuery,
  AdminUserListQueryDto,
  type AdminUserListResponse,
  AdminUserListResponseDto,
} from './admin-users.dto.js';
import { AdminUsersQueryService } from './admin-users.service.js';
import { AcceptedResponseDto } from './password-reset.dto.js';
import { PasswordResetService } from './password-reset.service.js';

/**
 * Admin account reads and owner-triggered password reset (technical.md
 * §2.1-§2.3, issue #14). Shares the `admin/users` prefix with
 * {@link AdminUsersController} and {@link AdminUserLifecycleController}.
 */
@ApiTags('Admin users')
@ApiBearerAuth('bearer')
@Controller('admin/users')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminUserQueryController {
  constructor(
    private readonly query: AdminUsersQueryService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List / search / filter accounts.' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'suspended', 'deleted'] })
  @ApiQuery({ name: 'owner', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: AdminUserListResponseDto })
  @ApiProblemResponses({ validation: true, statuses: [403] })
  list(
    @Query(new ZodValidationPipe(AdminUserListQueryDto)) query: AdminUserListQuery,
  ): Promise<AdminUserListResponse> {
    return this.query.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Account detail (owner context: email, verification, sessions).' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  get(@Param('id') id: string): Promise<AdminUserDetail> {
    return this.query.get(id);
  }

  @Post(':id/password-reset')
  @HttpCode(202)
  @ApiOperation({ summary: 'Owner-triggered password-reset mail.' })
  @ApiResponse({ status: 202, type: AcceptedResponseDto })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  async triggerPasswordReset(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<{ accepted: true }> {
    await this.passwordReset.requestForUser(id, principal.userId);

    return { accepted: true };
  }
}
