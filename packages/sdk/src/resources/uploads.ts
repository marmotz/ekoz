/**
 * Resumable uploads (tus 1.0 core + creation) under `/uploads` (technical.md
 * §S4). An in-house client on top of the shared transport — token refresh
 * (including on a `401` mid-upload) is inherited from `SessionManager.request`.
 */

import type { SessionManager } from '../session/session-manager.js';

/** The finalization result of a completed upload — the ingested blob's metadata. */
export interface UploadResult {
  id: string;
  state: 'ready' | 'failed';
  contentType: string | null;
  sizeBytes: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasThumbnail: boolean;
}

/** `GET /uploads/:id`: a non-tus recovery view of an in-progress or finished upload. */
export interface UploadStatus {
  id: string;
  state: 'receiving' | 'ready' | 'failed';
  offset: string;
  length: string;
  filename: string;
  expiresAt: string;
}

export interface UploadOptions {
  /** Called after every chunk is accepted, with bytes sent so far and the total. */
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  /** Bytes per `PATCH` chunk. Default 5 MiB. */
  chunkSize?: number;
}

export interface UploadHandle {
  /** The server-assigned upload id (`Location`'s last path segment). */
  readonly id: string;
  /** Resolves once every chunk has been sent and the upload is finalized. */
  readonly promise: Promise<UploadResult>;
}

export interface UploadsResource {
  /**
   * Starts a new resumable upload: one `POST` (creation), then chunked
   * `PATCH`es of `chunkSize` bytes each. On a network error mid-chunk, checks
   * the real server-side offset with a `HEAD` and continues from there (up to
   * 3 retries per chunk, exponential backoff). The returned promise resolves
   * once the id is assigned — before any byte is sent.
   */
  upload(file: Blob | File, options?: UploadOptions): Promise<UploadHandle>;
  /** Resumes an upload already created elsewhere, from its current server-side offset (a `HEAD` first). */
  resume(id: string, file: Blob | File, options?: UploadOptions): Promise<UploadHandle>;
  /** `DELETE /uploads/:id`: releases the blob if it had finished ingesting, deletes staging bytes. */
  cancel(id: string): Promise<void>;
  get(id: string): Promise<UploadStatus>;
}

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CHUNK_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 250;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException('The upload was aborted.', 'AbortError');
  }
}

/** Cross-runtime base64, for the `Upload-Metadata` tus header (`filename <base64>`). */
function encodeUploadMetadata(filename: string): string {
  const bytes = new TextEncoder().encode(filename);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return `filename ${btoa(binary)}`;
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createUploadsResource(session: SessionManager): UploadsResource {
  const path = (id: string) => `/uploads/${encodeURIComponent(id)}`;

  async function create(
    file: Blob | File,
    filename: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = await session.request<Response>('POST', '/uploads', {
      headers: {
        'Upload-Length': String(file.size),
        'Upload-Metadata': encodeUploadMetadata(filename),
      },
      signal,
      responseType: 'raw',
    });
    const location = response.headers.get('Location');
    if (!location) {
      throw new Error('POST /uploads did not return a Location header.');
    }

    return location.split('/').pop() as string;
  }

  async function head(id: string): Promise<{ offset: number; length: number }> {
    const response = await session.request<Response>('HEAD', path(id), { responseType: 'raw' });

    return {
      offset: Number(response.headers.get('Upload-Offset') ?? '0'),
      length: Number(response.headers.get('Upload-Length') ?? '0'),
    };
  }

  async function patchChunk(
    id: string,
    offset: number,
    chunk: Blob,
    signal: AbortSignal | undefined,
  ): Promise<{ offset: number; result: UploadResult | undefined }> {
    const response = await session.request<Response>('PATCH', path(id), {
      headers: {
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      rawBody: chunk,
      signal,
      responseType: 'raw',
    });
    const newOffset = Number(response.headers.get('Upload-Offset') ?? String(offset));
    if (response.status === 204) {
      return { offset: newOffset, result: undefined };
    }

    // Finalized: the result travels on `Ekoz-Upload` (technical.md §S4); the body carries the same JSON.
    const header = response.headers.get('Ekoz-Upload');
    const result = header
      ? (JSON.parse(header) as UploadResult)
      : ((await response.json()) as UploadResult);

    return { offset: newOffset, result };
  }

  /** One chunk, retried up to `MAX_CHUNK_RETRIES` times with a `HEAD` resync between attempts. */
  async function patchChunkWithRetry(
    id: string,
    offset: number,
    chunk: Blob,
    signal: AbortSignal | undefined,
  ): Promise<{ offset: number; result: UploadResult | undefined }> {
    let currentOffset = offset;
    let currentChunk = chunk;

    for (let attempt = 0; ; attempt++) {
      assertNotAborted(signal);
      try {
        return await patchChunk(id, currentOffset, currentChunk, signal);
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (attempt >= MAX_CHUNK_RETRIES) throw error;

        const status = await head(id);
        if (status.offset !== currentOffset) {
          // The server has bytes we thought failed to arrive; re-slice from its real offset.
          const consumed = status.offset - offset;
          currentChunk = chunk.slice(consumed);
          currentOffset = status.offset;
        }
        await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }

  async function runUpload(
    id: string,
    file: Blob | File,
    startOffset: number,
    options: UploadOptions,
  ): Promise<UploadResult> {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    let offset = startOffset;

    // A zero-byte file needs one (empty) chunk to finalize; the loop below never runs for it.
    if (file.size === 0 && offset === 0) {
      const { result } = await patchChunkWithRetry(id, 0, file.slice(0, 0), options.signal);
      if (result) return result;
    }

    while (offset < file.size) {
      assertNotAborted(options.signal);
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const { offset: newOffset, result } = await patchChunkWithRetry(
        id,
        offset,
        chunk,
        options.signal,
      );
      offset = newOffset;
      options.onProgress?.(offset, file.size);
      if (result) return result;
    }

    throw new Error(`Upload ${id} did not finalize after reaching its declared length.`);
  }

  return {
    async upload(file, options = {}) {
      const filename = file instanceof File ? file.name : 'upload';
      const id = await create(file, filename, options.signal);

      return { id, promise: runUpload(id, file, 0, options) };
    },

    async resume(id, file, options = {}) {
      const status = await head(id);

      return { id, promise: runUpload(id, file, status.offset, options) };
    },

    cancel(id) {
      return session.request<void>('DELETE', path(id));
    },

    get(id) {
      return session.request<UploadStatus>('GET', path(id));
    },
  };
}
