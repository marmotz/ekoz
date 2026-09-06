import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StorageDriver } from './storage-driver.js';

/**
 * Filesystem-backed {@link StorageDriver} (technical.md §6). Objects live under
 * `storage.local.path`; the key already carries the `blobs/<hh>/<hash>` fan-out
 * so a directory never holds the whole blob set.
 */
export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    // `key` is built by `blobStorageKey` from a hex hash — no traversal — but
    // resolve-and-check anyway so a future caller cannot escape the root.
    const base = resolve(this.root);
    const full = resolve(base, key);
    if (full !== base && !full.startsWith(`${base}/`)) {
      throw new Error(`storage key "${key}" escapes the storage root`);
    }

    return full;
  }

  // The local driver stores raw bytes only; the content type is tracked on the
  // `blob` row, not on disk.
  async put(key: string, body: NodeJS.ReadableStream): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await pipeline(body, createWriteStream(tmp));
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { force: true });

      throw error;
    }
  }

  async get(key: string): Promise<NodeJS.ReadableStream> {
    const target = this.pathFor(key);
    await stat(target); // surface a missing key as a rejection before streaming

    return createReadStream(target);
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async presignGet(): Promise<string | null> {
    return null;
  }

  async healthCheck(): Promise<void> {
    const base = resolve(this.root);
    await mkdir(base, { recursive: true });

    const probe = join(base, `.healthz.${process.pid}`);
    await pipeline(Readable.from([Buffer.from('')]), createWriteStream(probe));
    await unlink(probe);
  }
}
