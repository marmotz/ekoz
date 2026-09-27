/** tus 1.0 protocol version this server implements. */
export const TUS_VERSION = '1.0.0';
export const TUS_EXTENSIONS = 'creation,termination,expiration';

/**
 * Parse an `Upload-Metadata` header (tus 1.0 creation extension): a
 * comma-separated list of `key base64(value)` pairs, a bare `key` meaning an
 * empty string value.
 */
export function parseUploadMetadata(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) {
    return result;
  }

  for (const pair of header.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const [key, encoded] = trimmed.split(' ');
    if (!key) continue;

    result[key] = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
  }

  return result;
}

const MAX_FILENAME_LENGTH = 255;

/**
 * Sanitise a client-declared filename (technical.md §S4): Unicode-normalised
 * (NFC), stripped of any path component, and capped at 255 characters. Throws
 * for an empty result.
 */
export function sanitizeFilename(raw: string): string {
  const normalized = raw.normalize('NFC');
  const basename = normalized.split(/[/\\]/).pop() ?? '';
  const trimmed = basename.trim().slice(0, MAX_FILENAME_LENGTH);

  if (!trimmed) {
    throw new Error('filename is empty after sanitisation');
  }

  return trimmed;
}
