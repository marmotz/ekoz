import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalStorageDriver } from './local-storage.driver.js';
import { blobStorageKey } from './storage-driver.js';

const roots: string[] = [];
function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ekoz-storage-'));
  roots.push(root);

  return root;
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks).toString('utf8');
}

describe('LocalStorageDriver (unit)', () => {
  afterEach(async () => {
    const { rm } = await import('node:fs/promises');
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('round-trips a blob at its content-addressed key', async () => {
    const driver = new LocalStorageDriver(freshRoot());
    const key = blobStorageKey('a'.repeat(64));

    await driver.put(key, Readable.from([Buffer.from('hello')]));

    expect(await readAll(await driver.get(key))).toBe('hello');
  });

  it('put is atomic: no leftover temp file on success', async () => {
    const root = freshRoot();
    const driver = new LocalStorageDriver(root);
    const key = blobStorageKey('b'.repeat(64));
    await driver.put(key, Readable.from([Buffer.from('data')]));

    const { readdirSync } = await import('node:fs');
    const dir = join(root, 'blobs', 'bb');
    expect(readdirSync(dir)).toEqual(['b'.repeat(64)]);
    expect(readFileSync(join(dir, 'b'.repeat(64)), 'utf8')).toBe('data');
  });

  it('delete is idempotent for a missing key', async () => {
    const driver = new LocalStorageDriver(freshRoot());
    await expect(driver.delete(blobStorageKey('c'.repeat(64)))).resolves.toBeUndefined();
  });

  it('get rejects for an absent key', async () => {
    const driver = new LocalStorageDriver(freshRoot());
    await expect(driver.get(blobStorageKey('d'.repeat(64)))).rejects.toThrow();
  });

  it('presignGet always returns null', async () => {
    const driver = new LocalStorageDriver(freshRoot());
    expect(await driver.presignGet()).toBeNull();
  });

  it('rejects a key that escapes the storage root', async () => {
    const driver = new LocalStorageDriver(freshRoot());
    await expect(driver.put('../evil', Readable.from([Buffer.from('x')]))).rejects.toThrow(/escapes/);
  });

  it('healthCheck succeeds against a writable root', async () => {
    const driver = new LocalStorageDriver(freshRoot());
    await expect(driver.healthCheck()).resolves.toBeUndefined();
  });
});
