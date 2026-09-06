import { fileTypeFromBuffer } from 'file-type';

/** The multipart file shape the avatar endpoint consumes (multer memory storage). */
export interface UploadedAvatar {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

/**
 * Sniff the real content type of `buffer` from its magic bytes (technical.md
 * §13). Returns `null` when the bytes match no known type — the caller rejects
 * anything not in `avatar.allowed_mime`.
 */
export async function sniffImageMime(buffer: Buffer): Promise<string | null> {
  const detected = await fileTypeFromBuffer(buffer);

  return detected?.mime ?? null;
}
