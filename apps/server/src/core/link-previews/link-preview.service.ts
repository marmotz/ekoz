import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { SafeFetchBlockedError, SafeFetchError, safeFetch } from '../net/safe-fetch.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BlobService } from '../storage/blob.service.js';
import { FileAccessRegistry } from '../storage/file-access.registry.js';
import { MediaAnnotationService } from '../storage/media-annotation.service.js';
import { sniffContentType } from '../storage/sniff-content-type.js';
import { parseHtmlMetadata } from './html-metadata.js';
import { LinkPreviewUrlInvalidError } from './link-preview.errors.js';
import type { LinkPreviewRow } from './link-preview.view.js';

const HTML_MAX_BYTES = 1024 * 1024; // 1 MiB
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
const FAILED_CACHE_TTL_SECONDS = 60 * 60; // 1 h, fixed regardless of `link_previews.cache_ttl`

/**
 * Fetches and caches link preview metadata (technical.md §S10). A cache hit
 * within TTL is served without an outbound fetch; a `failed` fetch is cached
 * too (1 h, fixed) so an unreachable or broken site is not hammered.
 */
@Injectable()
export class LinkPreviewService implements OnModuleInit {
  private readonly logger = new Logger(LinkPreviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly blobs: BlobService,
    private readonly mediaAnnotation: MediaAnnotationService,
    private readonly fileAccess: FileAccessRegistry,
  ) {}

  /** `preview` file refs (the cache's own image, technical.md §S10) are open to any authenticated user. */
  onModuleInit(): void {
    this.fileAccess.register('preview', async (ref) => {
      const preview = (await this.prisma.orm.public.LinkPreview.where({
        id: ref.id,
      }).first()) as LinkPreviewRow | null;
      if (!preview?.imageBlobId) {
        return null;
      }

      const blob = await this.blobs.findById(preview.imageBlobId);

      return blob ? { blob } : null;
    });
  }

  /** Normalise a caller-supplied URL: `http(s)` only, no fragment. */
  normalize(rawUrl: string): string {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new LinkPreviewUrlInvalidError();
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new LinkPreviewUrlInvalidError();
    }
    parsed.hash = '';

    return parsed.toString();
  }

  /** The cached preview for `url` (normalised first), fetching synchronously on a cache miss or expiry. */
  async resolve(rawUrl: string): Promise<LinkPreviewRow> {
    const url = this.normalize(rawUrl);

    const existing = (await this.prisma.orm.public.LinkPreview.where({
      url,
    }).first()) as LinkPreviewRow | null;
    if (existing && !this.isExpired(existing)) {
      return existing;
    }

    return this.fetchAndCache(url, existing?.id);
  }

  private isExpired(row: LinkPreviewRow): boolean {
    const ttlSeconds =
      row.status === 'failed'
        ? FAILED_CACHE_TTL_SECONDS
        : this.config.get('link_previews.cache_ttl');

    return Date.now() > new Date(row.fetchedAt).getTime() + ttlSeconds * 1000;
  }

  private async fetchAndCache(url: string, existingId?: string): Promise<LinkPreviewRow> {
    try {
      const { finalUrl, body } = await safeFetch(url, {
        allowedContentTypePrefixes: ['text/html'],
        maxBytes: HTML_MAX_BYTES,
      });
      const html = body.toString('utf8');
      const metadata = parseHtmlMetadata(html, finalUrl);
      const imageBlobId = metadata.imageUrl ? await this.ingestImage(metadata.imageUrl) : null;

      return await this.upsert(url, existingId, {
        title: metadata.title,
        description: metadata.description,
        siteName: metadata.siteName,
        imageBlobId,
        status: 'ready',
      });
    } catch (error) {
      if (error instanceof SafeFetchBlockedError || error instanceof SafeFetchError) {
        this.logger.debug(`Link preview fetch failed for ${url}: ${error.message}`);

        return this.upsert(url, existingId, {
          title: null,
          description: null,
          siteName: null,
          imageBlobId: null,
          status: 'failed',
        });
      }
      throw error;
    }
  }

  private async ingestImage(imageUrl: string): Promise<string | null> {
    try {
      const { body } = await safeFetch(imageUrl, {
        allowedContentTypePrefixes: ['image/'],
        maxBytes: IMAGE_MAX_BYTES,
      });
      const contentType = await sniffContentType(body);
      if (!contentType.startsWith('image/')) {
        return null;
      }

      const blob = await this.blobs.ingest(Readable.from(body), { contentType, uploaderId: null });

      const dir = await mkdtemp(join(tmpdir(), 'ekoz-link-preview-'));
      try {
        const path = join(dir, 'image');
        await writeFile(path, body);
        await this.mediaAnnotation.annotate(blob, path);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }

      return blob.id;
    } catch (error) {
      this.logger.debug(
        `Link preview image fetch failed for ${imageUrl}: ${(error as Error).message}`,
      );

      return null;
    }
  }

  private async upsert(
    url: string,
    existingId: string | undefined,
    fields: {
      title: string | null;
      description: string | null;
      siteName: string | null;
      imageBlobId: string | null;
      status: 'ready' | 'failed';
    },
  ): Promise<LinkPreviewRow> {
    const fetchedAt = new Date().toISOString();
    if (existingId) {
      return (await this.prisma.orm.public.LinkPreview.where({ id: existingId }).update({
        ...fields,
        fetchedAt,
      })) as LinkPreviewRow;
    }

    return (await this.prisma.orm.public.LinkPreview.create({
      url,
      ...fields,
      fetchedAt,
    })) as LinkPreviewRow;
  }
}
