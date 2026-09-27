import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../http/auth.guard.js';
import { CurrentPrincipal } from '../http/current-principal.decorator.js';
import { entityIdSchema } from '../http/entity-id.schema.js';
import { OwnerGuard } from '../http/owner.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { AdminStorageService } from './admin-storage.service.js';

const BlobIdParamSchema = z.object({ id: entityIdSchema });

/** Force-remove a blob everywhere it is referenced, owner only (technical.md §S11, issue #146). */
@ApiTags('Admin storage')
@ApiBearerAuth('bearer')
@Controller('admin/blobs/:id')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminBlobsController {
  constructor(private readonly storage: AdminStorageService) {}

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Remove a blob from every attachment, link preview and avatar referencing it, audited.',
  })
  @ApiProblemResponses({ statuses: [403, 404] })
  async remove(
    @Param(new ZodValidationPipe(BlobIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.storage.removeBlobEverywhere(params.id, principal.userId);
  }
}
