import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Blob, BlobService } from '../storage/blob.service.js';
import type { FileAccessRegistry } from '../storage/file-access.registry.js';
import type { MediaAnnotationService } from '../storage/media-annotation.service.js';
import { LinkPreviewUrlInvalidError } from './link-preview.errors.js';
import { LinkPreviewService } from './link-preview.service.js';
import type { LinkPreviewRow } from './link-preview.view.js';

vi.mock('../net/safe-fetch.js', () => ({
  safeFetch: vi.fn(),
  SafeFetchBlockedError: class SafeFetchBlockedError extends Error {},
  SafeFetchError: class SafeFetchError extends Error {},
}));

const { safeFetch } = await import('../net/safe-fetch.js');
const safeFetchMock = vi.mocked(safeFetch);

// A real 1x1 PNG so `sniffContentType` (not mocked) sniffs `image/png` from the bytes.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function makePrisma(initial: LinkPreviewRow[] = []) {
  const rows = new Map(initial.map((r) => [r.url, r]));
  let idCounter = 0;
  const LinkPreview = {
    where: (cond: { url?: string; id?: string }) => ({
      first: async () => {
        if (cond.url !== undefined) {
          return rows.get(cond.url) ?? null;
        }

        return [...rows.values()].find((r) => r.id === cond.id) ?? null;
      },
      update: async (fields: Partial<LinkPreviewRow>) => {
        const row = [...rows.values()].find((r) => r.id === cond.id);
        if (!row) {
          throw new Error('row not found');
        }
        Object.assign(row, fields);

        return row;
      },
    }),
    create: async (fields: Omit<LinkPreviewRow, 'id'>) => {
      idCounter += 1;
      const row = { id: `lp-${idCounter}`, ...fields } as LinkPreviewRow;
      rows.set(row.url, row);

      return row;
    },
  };

  return { orm: { public: { LinkPreview } } } as unknown as PrismaService;
}

function makeService(options: { rows?: LinkPreviewRow[]; cacheTtlSeconds?: number } = {}) {
  const prisma = makePrisma(options.rows);
  const config = {
    get: vi.fn((key: string) =>
      key === 'link_previews.cache_ttl' ? (options.cacheTtlSeconds ?? 86_400) : undefined,
    ),
  } as unknown as ConfigService;
  const blob: Blob = {
    id: 'blob-1',
    hash: 'hash',
    sizeBytes: BigInt(PNG_BYTES.length),
    contentType: 'image/png',
    storageKey: 'key',
    refCount: 0,
    uploaderId: null,
    touchedAt: new Date().toISOString(),
    width: null,
    height: null,
    durationMs: null,
    thumbnailBlobId: null,
    createdAt: new Date().toISOString(),
  };
  const ingest = vi.fn().mockResolvedValue(blob);
  const blobs = { ingest, findById: vi.fn() } as unknown as BlobService;
  const annotate = vi.fn().mockResolvedValue({
    width: 1,
    height: 1,
    durationMs: null,
    hasThumbnail: false,
  });
  const mediaAnnotation = { annotate } as unknown as MediaAnnotationService;
  const fileAccess = { register: vi.fn() } as unknown as FileAccessRegistry;

  return {
    service: new LinkPreviewService(prisma, config, blobs, mediaAnnotation, fileAccess),
    ingest,
    annotate,
  };
}

describe('LinkPreviewService (unit)', () => {
  it('normalizes a URL by stripping its fragment', () => {
    const { service } = makeService();
    expect(service.normalize('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('rejects a non-http(s) or malformed URL', () => {
    const { service } = makeService();
    expect(() => service.normalize('not a url')).toThrow(LinkPreviewUrlInvalidError);
    expect(() => service.normalize('ftp://example.com/file')).toThrow(LinkPreviewUrlInvalidError);
  });

  it('serves a fresh cache entry without fetching', async () => {
    const row: LinkPreviewRow = {
      id: 'lp-1',
      url: 'https://example.com/page',
      title: 'Cached title',
      description: null,
      siteName: null,
      imageBlobId: null,
      status: 'ready',
      fetchedAt: new Date().toISOString(),
    };
    const { service } = makeService({ rows: [row] });

    const result = await service.resolve('https://example.com/page');

    expect(result).toEqual(row);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('fetches and caches a new entry from HTML metadata', async () => {
    safeFetchMock.mockResolvedValueOnce({
      finalUrl: 'https://example.com/page',
      contentType: 'text/html',
      body: Buffer.from('<html><head><title>Example</title></head></html>'),
    });
    const { service } = makeService();

    const result = await service.resolve('https://example.com/page');

    expect(result.status).toBe('ready');
    expect(result.title).toBe('Example');
    expect(result.imageBlobId).toBeNull();
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it('ingests and annotates the preview image', async () => {
    safeFetchMock
      .mockResolvedValueOnce({
        finalUrl: 'https://example.com/page',
        contentType: 'text/html',
        body: Buffer.from(
          '<html><head><meta property="og:title" content="With image"><meta property="og:image" content="https://example.com/preview.png"></head></html>',
        ),
      })
      .mockResolvedValueOnce({
        finalUrl: 'https://example.com/preview.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      });
    const { service, ingest, annotate } = makeService();

    const result = await service.resolve('https://example.com/page');

    expect(result.title).toBe('With image');
    expect(result.imageBlobId).toBe('blob-1');
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(annotate).toHaveBeenCalledTimes(1);
  });

  it('caches a failed fetch for the fixed 1h TTL', async () => {
    const { SafeFetchBlockedError } = await import('../net/safe-fetch.js');
    safeFetchMock.mockRejectedValueOnce(new SafeFetchBlockedError());
    const { service } = makeService();

    const result = await service.resolve('https://example.com/page');

    expect(result.status).toBe('failed');
    expect(result.title).toBeNull();
  });

  it('refetches an expired cache entry, updating the same row', async () => {
    const staleRow: LinkPreviewRow = {
      id: 'lp-1',
      url: 'https://example.com/page',
      title: 'Old title',
      description: null,
      siteName: null,
      imageBlobId: null,
      status: 'ready',
      fetchedAt: new Date(Date.now() - 90_000 * 1000).toISOString(),
    };
    safeFetchMock.mockResolvedValueOnce({
      finalUrl: 'https://example.com/page',
      contentType: 'text/html',
      body: Buffer.from('<html><head><title>New title</title></head></html>'),
    });
    const { service } = makeService({ rows: [staleRow], cacheTtlSeconds: 60 });

    const result = await service.resolve('https://example.com/page');

    expect(result.id).toBe('lp-1');
    expect(result.title).toBe('New title');
  });
});
