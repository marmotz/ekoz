import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '../config/config.service.js';
import { ApiProblemResponses } from '../http/api-problem-responses.decorator.js';
import { AuthGuard } from '../http/auth.guard.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { type FetchLinkPreview, FetchLinkPreviewDto } from './link-preview.dto.js';
import { LinkPreviewDisabledError } from './link-preview.errors.js';
import { LinkPreviewService } from './link-preview.service.js';
import { isEmptyPreview, LinkPreviewViewDto, toLinkPreviewView } from './link-preview.view.js';
import { LinkPreviewThrottleGuard } from './link-preview-throttle.guard.js';

@ApiTags('Link previews')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard, LinkPreviewThrottleGuard)
export class LinkPreviewController {
  constructor(
    private readonly linkPreviews: LinkPreviewService,
    private readonly config: ConfigService,
  ) {}

  @Post('link-previews')
  @ApiOperation({
    summary: 'Fetch (or return cached) preview metadata for a URL (needs link_previews.enabled).',
  })
  @ApiOkResponse({ type: LinkPreviewViewDto })
  @ApiProblemResponses({ validation: true, statuses: [404, 429] })
  async fetch(
    @Body(new ZodValidationPipe(FetchLinkPreviewDto)) body: FetchLinkPreview,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.config.get('link_previews.enabled')) {
      throw new LinkPreviewDisabledError();
    }

    const row = await this.linkPreviews.resolve(body.url);
    if (isEmptyPreview(row)) {
      res.status(204).end();

      return;
    }

    res.status(200).json(toLinkPreviewView(row));
  }
}
