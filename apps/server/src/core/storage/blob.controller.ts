import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../http/domain-error.js';
import { getRequestContext } from '../http/request-context.js';
import { BlobService } from './blob.service.js';
import { BlobAccessRegistry } from './blob-access.registry.js';

/**
 * `GET /blobs/:id` (technical.md §6). Authenticated (the global guard baseline;
 * a real `AuthGuard` lands with identity). The concrete access decision is
 * delegated to the policies referencing features register in
 * {@link BlobAccessRegistry}; server-core grants nothing itself, so an
 * unreferenced blob is `404`. Responses carry `ETag: "<hash>"` and a long
 * immutable cache (content-addressed, so the body never changes for an id).
 */
@Controller('blobs')
export class BlobController {
  constructor(
    private readonly blobs: BlobService,
    private readonly access: BlobAccessRegistry,
  ) {}

  @Get(':id')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const blob = await this.blobs.findById(id);
    // Same 404 whether the blob is absent or the caller may not see it: do not
    // confirm existence to an unauthorised caller.
    if (!blob || !(await this.access.isAllowed(blob, getRequestContext()))) {
      throw new DomainError('storage.blob_not_found', 'No such blob.', 404, 'Not Found');
    }

    if (res.req.headers['if-none-match'] === `"${blob.hash}"`) {
      res.status(304).end();

      return;
    }

    res.setHeader('Content-Type', blob.contentType);
    res.setHeader('Content-Length', String(blob.sizeBytes));
    res.setHeader('ETag', `"${blob.hash}"`);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');

    const stream = await this.blobs.openContent(blob);
    stream.pipe(res);
  }
}
