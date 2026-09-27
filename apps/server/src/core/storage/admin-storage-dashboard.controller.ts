import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard } from '../http/auth.guard.js';
import { OwnerGuard } from '../http/owner.guard.js';
import { type AdminStorageDashboard, AdminStorageDashboardDto } from './admin-storage.dto.js';
import { AdminStorageService } from './admin-storage.service.js';

/** Server-wide storage dashboard, owner only (technical.md §S11, issue #146). */
@ApiTags('Admin storage')
@ApiBearerAuth('bearer')
@Controller('admin/storage')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminStorageDashboardController {
  constructor(private readonly storage: AdminStorageService) {}

  @Get()
  @ApiOperation({ summary: 'Global storage usage, capacity, top consumers and media tooling.' })
  @ApiOkResponse({ type: AdminStorageDashboardDto })
  @ApiProblemResponses({ statuses: [403] })
  dashboard(): Promise<AdminStorageDashboard> {
    return this.storage.dashboard();
  }
}
