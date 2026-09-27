import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../http/auth.guard.js';
import { CurrentPrincipal } from '../http/current-principal.decorator.js';
import { entityIdSchema } from '../http/entity-id.schema.js';
import { OwnerGuard } from '../http/owner.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import {
  type AdminUserStorageView,
  AdminUserStorageViewDto,
  type SetUserStorageQuota,
  SetUserStorageQuotaDto,
} from './admin-storage.dto.js';
import { AdminStorageService } from './admin-storage.service.js';

const UserIdParamSchema = z.object({ id: entityIdSchema });

/** Per-user storage quota override, owner only (technical.md §S11, issue #146). */
@ApiTags('Admin storage')
@ApiBearerAuth('bearer')
@Controller('admin/users/:id')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminUserStorageController {
  constructor(private readonly storage: AdminStorageService) {}

  @Get('storage')
  @ApiOperation({ summary: "A user's storage usage, pending uploads and effective quota." })
  @ApiOkResponse({ type: AdminUserStorageViewDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  get(
    @Param(new ZodValidationPipe(UserIdParamSchema)) params: { id: string },
  ): Promise<AdminUserStorageView> {
    return this.storage.getUserStorage(params.id);
  }

  @Put('storage-quota')
  @HttpCode(204)
  @ApiOperation({ summary: "Override a user's storage quota (null = unlimited), audited." })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  async set(
    @Param(new ZodValidationPipe(UserIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(SetUserStorageQuotaDto)) body: SetUserStorageQuota,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    const quotaBytes = body.quotaBytes === null ? null : BigInt(body.quotaBytes);
    await this.storage.setUserQuota(params.id, quotaBytes, principal.userId);
  }

  @Delete('storage-quota')
  @HttpCode(204)
  @ApiOperation({ summary: "Revert a user's quota to the server default, audited." })
  @ApiProblemResponses({ statuses: [403, 404] })
  async reset(
    @Param(new ZodValidationPipe(UserIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.storage.resetUserQuota(params.id, principal.userId);
  }
}
