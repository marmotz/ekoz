import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { StorageDriver } from './storage-driver.js';
import { blobStorageKey } from './storage-driver.js';

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Shared behavioural contract every {@link StorageDriver} must satisfy
 * (technical.md §S3). Run against `local` ({@link LocalStorageDriver}, unit)
 * and `s3` (integration, MinIO).
 */
export function describeStorageDriverContract(
  name: string,
  makeDriver: () => StorageDriver | Promise<StorageDriver>,
): void {
  describe(`${name} storage driver contract`, () => {
    it('round-trips a blob at its content-addressed key', async () => {
      const driver = await makeDriver();
      const key = blobStorageKey('a'.repeat(64));

      await driver.put(key, Readable.from([Buffer.from('hello')]), 'text/plain');

      expect(await readAll(await driver.get(key))).toBe('hello');
    });

    it('delete is idempotent for a missing key', async () => {
      const driver = await makeDriver();
      await expect(driver.delete(blobStorageKey('c'.repeat(64)))).resolves.toBeUndefined();
    });

    it('get rejects for an absent key', async () => {
      const driver = await makeDriver();
      await expect(driver.get(blobStorageKey('d'.repeat(64)))).rejects.toThrow();
    });

    it('healthCheck succeeds', async () => {
      const driver = await makeDriver();
      await expect(driver.healthCheck()).resolves.toBeUndefined();
    });
  });
}
