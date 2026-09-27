import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sniffContentType } from './sniff-content-type.js';

// A minimal valid 1x1 PNG (file-type needs a real, parseable file, not just
// the 8-byte magic prefix — its PNG detector reads past the signature).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=',
  'base64',
);

describe('sniffContentType', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ekoz-sniff-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a known binary signature (PNG) from a path', async () => {
    const path = join(dir, 'file');
    await writeFile(path, PNG_1X1);

    expect(await sniffContentType(path)).toBe('image/png');
  });

  it('detects a known binary signature (PNG) from a buffer', async () => {
    expect(await sniffContentType(PNG_1X1)).toBe('image/png');
  });

  it('falls back to text/plain for valid UTF-8 text with no recognised signature', async () => {
    const path = join(dir, 'file');
    await writeFile(path, 'hello, world — plain text with unicode é', 'utf-8');

    expect(await sniffContentType(path)).toBe('text/plain');
  });

  it('falls back to application/octet-stream for binary without a NUL byte match and invalid UTF-8', async () => {
    const path = join(dir, 'file');
    // Lone continuation byte: never valid UTF-8 on its own.
    await writeFile(path, Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02]));

    expect(await sniffContentType(path)).toBe('application/octet-stream');
  });

  it('falls back to application/octet-stream when a NUL byte is present', async () => {
    const path = join(dir, 'file');
    await writeFile(path, Buffer.from('abc\u0000def'));

    expect(await sniffContentType(path)).toBe('application/octet-stream');
  });
});
