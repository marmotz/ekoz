import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard } from '../http/auth.guard.js';
import { OwnerGuard } from '../http/owner.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import {
  type AdminAttachmentsPage,
  AdminAttachmentsPageDto,
  type AdminAttachmentsQuery,
  AdminAttachmentsQueryDto,
} from './admin-storage.dto.js';
import { AdminStorageService } from './admin-storage.service.js';

/** Cross-room attachment search, owner only (technical.md §S11, issue #146). */
@ApiTags('Admin storage')
@ApiBearerAuth('bearer')
@Controller('admin/attachments')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminAttachmentsController {
  constructor(private readonly storage: AdminStorageService) {}

  @Get()
  @ApiOperation({ summary: 'Search attachments across every room, newest first.' })
  @ApiOkResponse({ type: AdminAttachmentsPageDto })
  @ApiProblemResponses({ validation: true, statuses: [403] })
  search(
    @Query(new ZodValidationPipe(AdminAttachmentsQueryDto)) query: AdminAttachmentsQuery,
  ): Promise<AdminAttachmentsPage> {
    return this.storage.searchAttachments(query);
  }
}
