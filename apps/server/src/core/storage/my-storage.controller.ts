import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../http/auth.guard.js';
import { CurrentPrincipal } from '../http/current-principal.decorator.js';
import { type MyStorageView, MyStorageViewDto } from './my-storage.dto.js';
import { StorageQuotaService } from './storage-quota.service.js';

/** The caller's own storage usage against their quota (technical.md §S8). */
@ApiTags('Storage')
@ApiBearerAuth('bearer')
@Controller('me')
@UseGuards(AuthGuard)
export class MyStorageController {
  constructor(private readonly quotas: StorageQuotaService) {}

  @Get('storage')
  @ApiOperation({ summary: "The calling account's storage usage and quota." })
  @ApiOkResponse({ type: MyStorageViewDto })
  @ApiProblemResponses()
  async storage(@CurrentPrincipal() principal: AuthPrincipal): Promise<MyStorageView> {
    const { usedBytes, pendingBytes, quotaBytes } = await this.quotas.storageOf(principal.userId);

    return {
      usedBytes: usedBytes.toString(),
      pendingBytes: pendingBytes.toString(),
      quotaBytes: quotaBytes?.toString() ?? null,
    };
  }
}
