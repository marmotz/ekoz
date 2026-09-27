import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Blob } from './blob.service.js';
import { BlobService } from './blob.service.js';
import { generateThumbnail, probeMediaDimensions } from './media-probe.js';
import { MediaToolsService } from './media-tools.service.js';

export interface MediaMetadata {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasThumbnail: boolean;
}

const NO_METADATA: MediaMetadata = {
  width: null,
  height: null,
  durationMs: null,
  hasThumbnail: false,
};

function isEligible(contentType: string): boolean {
  if (contentType === 'image/svg+xml') {
    return false;
  }

  return contentType.startsWith('image/') || contentType.startsWith('video/');
}

/**
 * Media metadata and thumbnails, generated once per blob at upload
 * finalization (technical.md §S7). Optional: a missing ffmpeg/ffprobe, or any
 * failure along the way, only logs a warning — the upload stays `ready` with
 * no metadata. The thumbnail is ingested as its own blob with no uploader
 * (never charged against a quota) and retained for as long as the parent blob
 * references it.
 */
@Injectable()
export class MediaAnnotationService {
  private readonly logger = new Logger(MediaAnnotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tools: MediaToolsService,
    private readonly blobs: BlobService,
  ) {}

  /**
   * Annotate `blob` from the bytes at `sourcePath` (the still-present staging
   * file). A no-op that returns the blob's existing metadata when it already
   * has some (a deduplicated upload does not recompute it) or when the
   * content type is not eligible.
   */
  async annotate(blob: Blob, sourcePath: string): Promise<MediaMetadata> {
    if (blob.width !== null || blob.durationMs !== null || blob.thumbnailBlobId !== null) {
      return {
        width: blob.width,
        height: blob.height,
        durationMs: blob.durationMs,
        hasThumbnail: blob.thumbnailBlobId !== null,
      };
    }

    if (!this.tools.available || !isEligible(blob.contentType)) {
      return NO_METADATA;
    }

    try {
      return await this.compute(blob, sourcePath);
    } catch (error) {
      this.logger.warn(`Media annotation failed for blob ${blob.id}: ${(error as Error).message}`);

      return NO_METADATA;
    }
  }

  private async compute(blob: Blob, sourcePath: string): Promise<MediaMetadata> {
    const ffprobePath = this.config.get('media.ffprobe_path');
    const ffmpegPath = this.config.get('media.ffmpeg_path');
    const isVideo = blob.contentType.startsWith('video/');

    const dims = await probeMediaDimensions(ffprobePath, sourcePath);

    const dir = await mkdtemp(join(tmpdir(), 'ekoz-thumb-'));
    let thumbnailBlobId: string | null = null;
    try {
      const thumbPath = join(dir, 'thumb.jpg');
      const generated = await generateThumbnail(ffmpegPath, sourcePath, thumbPath, {
        isVideo,
        durationMs: dims.durationMs,
      });

      if (generated) {
        const thumbnail = await this.blobs.ingest(createReadStream(thumbPath), {
          contentType: 'image/jpeg',
          uploaderId: null,
        });
        await this.blobs.retain(thumbnail.id);
        thumbnailBlobId = thumbnail.id;
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    await this.prisma.orm.public.Blob.where({ id: blob.id }).update({
      width: dims.width,
      height: dims.height,
      durationMs: dims.durationMs,
      thumbnailBlobId,
    });

    return { ...dims, hasThumbnail: thumbnailBlobId !== null };
  }
}
