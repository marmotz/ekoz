import { Global, Module } from '@nestjs/common';
import { LinkPreviewController } from './link-preview.controller.js';
import { LinkPreviewService } from './link-preview.service.js';
import { LinkPreviewThrottleGuard } from './link-preview-throttle.guard.js';

/**
 * Link previews (technical.md §S10, issue #144): the SSRF-safe fetcher lives
 * in `core/net`, this module owns the cache, the throttle guard and
 * `POST /link-previews`.
 *
 * Global so `conversations/messages` injects `LinkPreviewService` without
 * re-importing (same pattern as `StorageModule`).
 */
@Global()
@Module({
  controllers: [LinkPreviewController],
  providers: [LinkPreviewService, LinkPreviewThrottleGuard],
  exports: [LinkPreviewService],
})
export class LinkPreviewsModule {}
