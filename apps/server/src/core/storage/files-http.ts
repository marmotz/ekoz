/**
 * `Content-Disposition` and `Range` helpers for `GET /files/:token`
 * (technical.md §S6).
 */

/** Content types the browser may render inline; everything else downloads. */
function isInlineType(contentType: string): boolean {
  if (contentType === 'image/svg+xml') {
    return false;
  }

  return (
    contentType.startsWith('image/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType === 'application/pdf'
  );
}

export function contentDispositionFor(contentType: string, filename: string | undefined): string {
  if (isInlineType(contentType)) {
    return 'inline';
  }

  const name = filename ?? 'download';

  return `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parse a single-range `Range: bytes=...` header against a resource of
 * `size` bytes. Supports `start-end`, the open-ended `start-`, and the
 * suffix form `-N` (last N bytes). Returns `null` for anything malformed, a
 * multi-range request, or a range unsatisfiable for `size`.
 */
export function parseRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return null;
  }

  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || end >= size) {
    return null;
  }

  return { start, end };
}
