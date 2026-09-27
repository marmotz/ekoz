import { open } from 'node:fs/promises';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';

const TEXT_PROBE_BYTES = 64 * 1024;

/**
 * Sniff the real content type of `input` from its bytes (technical.md §S5):
 * magic-byte detection first, a UTF-8 text fallback, then the generic binary
 * type. The declared type and the file extension are never consulted — only
 * used for display by the caller. `input` is a file path (uploads staged on
 * disk) or a `Buffer` (avatars, still memory-buffered).
 */
export async function sniffContentType(input: string | Buffer): Promise<string> {
  const detected =
    typeof input === 'string' ? await fileTypeFromFile(input) : await fileTypeFromBuffer(input);
  if (detected) {
    return detected.mime;
  }

  const probe =
    typeof input === 'string' ? await readProbe(input) : input.subarray(0, TEXT_PROBE_BYTES);
  if (!probe.includes(0) && isValidUtf8(probe)) {
    return 'text/plain';
  }

  return 'application/octet-stream';
}

async function readProbe(path: string): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(TEXT_PROBE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TEXT_PROBE_BYTES, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Rejects overlong encodings and lone surrogates like a strict UTF-8 decoder. */
function isValidUtf8(buffer: Buffer): boolean {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    decoder.decode(buffer);

    return true;
  } catch {
    return false;
  }
}
