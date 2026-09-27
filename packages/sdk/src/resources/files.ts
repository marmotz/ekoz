/**
 * Signed download URLs and room files (technical.md §S6).
 */

import type { SessionManager } from '../session/session-manager.js';
import type { FilesPage } from '../types/wire.js';

/**
 * A reference to downloadable content. Request-body-only (no `@ApiOkResponse`
 * anywhere echoes it back typed — the generated `IssueFileUrlsResponse`'s
 * `items` comes back as `unknown[]` because the server's schema is a
 * discriminated union the generator can't name), so declared by hand,
 * mirroring the server's `FileRefSchema`.
 */
export type FileRef =
  | { kind: 'attachment'; id: string; variant: 'original' | 'thumbnail' }
  | { kind: 'message_preview'; messageId: string }
  | { kind: 'preview'; previewId: string };

/** One entry of `POST /files/urls`'s response: issued, or denied with a code (e.g. `files.not_found`). */
export type FileUrlResult =
  | { ref: FileRef; url: string; expiresAt: string }
  | { ref: FileRef; error: string };

export interface IssueFileUrlsResponse {
  items: FileUrlResult[];
}

export interface ListRoomFilesParams {
  kind?: 'media' | 'documents';
  /** The newest page of files strictly before this attachment id. */
  before?: string;
  limit?: number;
}

export interface FilesResource {
  /** `POST /files/urls`: short-lived signed URLs for up to 100 refs at once. */
  urls(refs: FileRef[]): Promise<IssueFileUrlsResponse>;
  /** `GET /rooms/:id/files`: the room's attachments, newest first (needs `room.read`). */
  roomFiles(roomId: string, params?: ListRoomFilesParams): Promise<FilesPage>;
}

export function createFilesResource(session: SessionManager): FilesResource {
  return {
    urls(refs) {
      return session.request<IssueFileUrlsResponse>('POST', '/files/urls', {
        body: { items: refs },
      });
    },

    roomFiles(roomId, params = {}) {
      return session.request<FilesPage>('GET', `/rooms/${encodeURIComponent(roomId)}/files`, {
        query: { kind: params.kind, before: params.before, limit: params.limit },
      });
    },
  };
}

const REFRESH_MARGIN_MS = 60_000;

function refKey(ref: FileRef): string {
  switch (ref.kind) {
    case 'attachment':
      return `attachment:${ref.id}:${ref.variant}`;
    case 'message_preview':
      return `message_preview:${ref.messageId}`;
    case 'preview':
      return `preview:${ref.previewId}`;
  }
}

interface CachedUrl {
  url: string;
  expiresAtMs: number;
}

/**
 * Caches `files.urls()` results per ref, refreshing each 60s before it
 * expires. Calls made in the same synchronous batch (e.g. rendering a page of
 * attachments) join a single `POST /files/urls` request.
 */
export class SignedUrlCache {
  readonly #files: FilesResource;
  readonly #entries = new Map<string, CachedUrl>();
  #pendingRefs: Map<string, FileRef> | undefined;
  #pendingResult: Promise<void> | undefined;

  constructor(files: FilesResource) {
    this.#files = files;
  }

  /** The signed URL for `ref`, or `undefined` when the server denied it. */
  async get(ref: FileRef): Promise<string | undefined> {
    const key = refKey(ref);
    const cached = this.#entries.get(key);
    if (cached && cached.expiresAtMs - REFRESH_MARGIN_MS > Date.now()) {
      return cached.url;
    }

    this.#pendingRefs ??= new Map();
    this.#pendingRefs.set(key, ref);
    this.#pendingResult ??= this.#flush();
    await this.#pendingResult;

    return this.#entries.get(key)?.url;
  }

  /** Drops every cached entry, forcing the next `get()` to re-issue a URL. */
  clear(): void {
    this.#entries.clear();
  }

  async #flush(): Promise<void> {
    // Let synchronous callers in the same tick join this batch before the request fires.
    await Promise.resolve();
    const pending = this.#pendingRefs;
    this.#pendingRefs = undefined;
    this.#pendingResult = undefined;
    if (!pending || pending.size === 0) return;

    const entries = [...pending.entries()];
    const response = await this.#files.urls(entries.map(([, ref]) => ref));
    response.items.forEach((item, index) => {
      const key = entries[index]?.[0];
      if (!key) return;
      if ('url' in item) {
        this.#entries.set(key, { url: item.url, expiresAtMs: Date.parse(item.expiresAt) });
      } else {
        this.#entries.delete(key);
      }
    });
  }
}
