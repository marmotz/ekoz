import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3StorageDriver } from './s3-storage.driver.js';
import { describeStorageDriverContract } from './storage-driver.contract.js';

const BUCKET = 'ekoz-test';
const ACCESS_KEY = 'ekoz-test-access';
const SECRET_KEY = 'ekoz-test-secret';

// MinIO removed `minio/minio` from Docker Hub in 2025; `quay.io/minio/minio` serves the
// last images they published there, but is itself gated (anonymous pulls can get a 401).
// Try each candidate — first whatever is already cached locally, then a fresh pull — and
// skip this suite (rather than fail CI) when none resolves. An environment with no
// registry access to either still runs every other test.
const MINIO_IMAGE_CANDIDATES = ['minio/minio:latest', 'quay.io/minio/minio:latest'];

function resolveMinioImage(): string | null {
  for (const image of MINIO_IMAGE_CANDIDATES) {
    try {
      execFileSync('docker', ['image', 'inspect', image], { stdio: 'ignore' });

      return image;
    } catch {
      // not cached locally, try the next candidate before attempting a pull
    }
  }

  for (const image of MINIO_IMAGE_CANDIDATES) {
    try {
      execFileSync('docker', ['pull', image], { stdio: 'ignore', timeout: 30_000 });

      return image;
    } catch {
      // unreachable or gated, try the next candidate
    }
  }

  return null;
}

const MINIO_IMAGE = resolveMinioImage();

describe.skipIf(MINIO_IMAGE === null)('S3StorageDriver (integration, MinIO)', () => {
  let container: StartedTestContainer;
  let endpoint: string;

  beforeAll(async () => {
    container = await new GenericContainer(MINIO_IMAGE as string)
      .withExposedPorts(9000)
      .withEnvironment({ MINIO_ROOT_USER: ACCESS_KEY, MINIO_ROOT_PASSWORD: SECRET_KEY })
      .withCommand(['server', '/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start();
    endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

    const admin = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    });
    await admin.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  function makeDriver(): S3StorageDriver {
    return new S3StorageDriver({
      endpoint,
      region: 'us-east-1',
      bucket: BUCKET,
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
      forcePathStyle: true,
    });
  }

  describeStorageDriverContract('s3 (MinIO)', makeDriver);

  it('presignGet returns a URL that serves the object with header overrides', async () => {
    const driver = makeDriver();
    const key = 'blobs/aa/presign-test';
    await driver.put(key, Readable.from([Buffer.from('presigned-bytes')]), 'text/plain');

    const url = await driver.presignGet(key, 60, {
      contentDisposition: 'attachment; filename="hello.txt"',
      contentType: 'text/plain',
    });
    expect(url).toContain(BUCKET);

    const response = await fetch(url as string);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('presigned-bytes');
    expect(response.headers.get('content-disposition')).toContain('hello.txt');
  });
});
