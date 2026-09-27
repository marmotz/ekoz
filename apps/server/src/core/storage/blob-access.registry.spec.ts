import { describe, expect, it } from 'vitest';
import type { Blob } from './blob.service.js';
import { BlobAccessRegistry } from './blob-access.registry.js';

const blob = {
  id: 'blb_1',
  hash: 'h',
  sizeBytes: 1n,
  contentType: 'image/png',
  storageKey: 'k',
  refCount: 1,
  uploaderId: null,
  touchedAt: '',
  width: null,
  height: null,
  durationMs: null,
  thumbnailBlobId: null,
  createdAt: '',
} satisfies Blob;

describe('BlobAccessRegistry (unit)', () => {
  it('denies by default when no policy is registered', async () => {
    expect(await new BlobAccessRegistry().isAllowed(blob, undefined)).toBe(false);
  });

  it('grants when any policy returns true', async () => {
    const registry = new BlobAccessRegistry();
    registry.register(() => false);
    registry.register(async () => true);
    expect(await registry.isAllowed(blob, undefined)).toBe(true);
  });

  it('denies when every policy returns false', async () => {
    const registry = new BlobAccessRegistry();
    registry.register(() => false);
    registry.register(async () => false);
    expect(await registry.isAllowed(blob, undefined)).toBe(false);
  });

  it('passes the blob and request context to the policy', async () => {
    const registry = new BlobAccessRegistry();
    let seen: unknown;
    registry.register((b, ctx) => {
      seen = { id: b.id, userId: ctx?.userId };

      return true;
    });
    await registry.isAllowed(blob, { requestId: 'r1', userId: 'user-7' });
    expect(seen).toEqual({ id: 'blb_1', userId: 'user-7' });
  });
});
