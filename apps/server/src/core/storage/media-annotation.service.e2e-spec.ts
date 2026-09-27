import { execFile, execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { BlobService } from './blob.service.js';
import { LocalStorageDriver } from './local-storage.driver.js';
import { MediaAnnotationService } from './media-annotation.service.js';
import { MediaToolsService } from './media-tools.service.js';

const execFileAsync = promisify(execFile);

function hasRealFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

function fakeConfig(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe.skipIf(!hasRealFfmpeg())('MediaAnnotationService (integration, real ffmpeg)', () => {
  let database: TestDatabase;
  let prisma: PrismaService;
  let blobs: BlobService;
  let dir: string;
  let imagePath: string;
  let imagePath2: string;
  let imagePath3: string;
  let imagePath4: string;

  async function makeImage(name: string, size: string): Promise<string> {
    const path = join(dir, name);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=red:s=${size}`,
      '-frames:v',
      '1',
      path,
    ]);

    return path;
  }

  beforeAll(async () => {
    database = await startTestDatabase();
    prisma = {
      orm: database.db.orm,
      sql: database.db.sql,
      raw: database.db.raw,
      transaction: database.db.transaction.bind(database.db),
      runtime: database.db.runtime.bind(database.db),
    } as unknown as PrismaService;
    blobs = new BlobService(
      prisma,
      new LocalStorageDriver(await mkdtemp(join(tmpdir(), 'ekoz-annotation-blobs-'))),
    );

    dir = await mkdtemp(join(tmpdir(), 'ekoz-annotation-'));
    // Distinct sizes so each fixture hashes to its own blob (content-addressed dedup).
    imagePath = await makeImage('still.png', '64x32');
    imagePath2 = await makeImage('still2.png', '65x33');
    imagePath3 = await makeImage('still3.png', '66x34');
    imagePath4 = await makeImage('still4.png', '67x35');
  }, 180_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await database?.stop();
  });

  const config = fakeConfig({ 'media.ffmpeg_path': 'ffmpeg', 'media.ffprobe_path': 'ffprobe' });

  async function toolsService(): Promise<MediaToolsService> {
    const tools = new MediaToolsService(config);
    await tools.onModuleInit();

    return tools;
  }

  it('annotates an image blob with dimensions and a thumbnail', async () => {
    const media = new MediaAnnotationService(prisma, config, await toolsService(), blobs);
    const realBlob = await blobs.ingest(createReadStream(imagePath), {
      contentType: 'image/png',
      uploaderId: 'alice',
    });

    const metadata = await media.annotate(realBlob, imagePath);

    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(32);
    expect(metadata.hasThumbnail).toBe(true);

    const updated = await blobs.findById(realBlob.id);
    expect(updated?.width).toBe(64);
    expect(updated?.height).toBe(32);
    expect(updated?.thumbnailBlobId).toBeTruthy();

    const thumbnail = await blobs.findById(updated?.thumbnailBlobId as string);
    expect(thumbnail?.uploaderId).toBeNull(); // never charged against a quota
    expect(thumbnail?.refCount).toBe(1); // retained by the parent blob
  });

  it('skips recomputation when the blob already has metadata (dedup)', async () => {
    const media = new MediaAnnotationService(prisma, config, await toolsService(), blobs);
    const blob = await blobs.ingest(createReadStream(imagePath2), {
      contentType: 'image/png',
      uploaderId: 'bob',
    });
    const first = await media.annotate(blob, imagePath2);
    expect(first.hasThumbnail).toBe(true);

    const refreshed = await blobs.findById(blob.id);
    const second = await media.annotate(refreshed!, imagePath2);
    expect(second).toEqual(first);
  });

  it('skips annotation entirely when tools are unavailable', async () => {
    const unavailableTools = new MediaToolsService(
      fakeConfig({
        'media.ffmpeg_path': '/no/such/ffmpeg',
        'media.ffprobe_path': '/no/such/ffprobe',
      }),
    );
    await unavailableTools.onModuleInit();
    const media = new MediaAnnotationService(prisma, config, unavailableTools, blobs);

    const blob = await blobs.ingest(createReadStream(imagePath3), {
      contentType: 'image/png',
      uploaderId: 'carol',
    });
    const metadata = await media.annotate(blob, imagePath3);

    expect(metadata).toEqual({
      width: null,
      height: null,
      durationMs: null,
      hasThumbnail: false,
    });
  });

  it('is a no-op for a content type that is not eligible', async () => {
    const media = new MediaAnnotationService(prisma, config, await toolsService(), blobs);
    const blob = await blobs.ingest(createReadStream(imagePath4), {
      contentType: 'application/pdf',
      uploaderId: 'dave',
    });
    const metadata = await media.annotate(blob, imagePath4);

    expect(metadata.hasThumbnail).toBe(false);
    expect(metadata.width).toBeNull();
  });
});
