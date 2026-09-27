import { Injectable } from '@nestjs/common';
import type { Blob } from './blob.service.js';
import type { FileRefKind, InternalFileRef } from './file-ref.js';

/** What a resolved {@link InternalFileRef} downloads as. */
export interface ResolvedFile {
  blob: Blob;
  /** Overrides the blob's own name for `Content-Disposition`; omitted keeps the blob's content type only. */
  filename?: string;
  /** Overrides the blob's stored content type (e.g. a thumbnail served as `image/jpeg`). */
  contentType?: string;
}

/**
 * Resolves a `userId`'s access to a ref to the blob it downloads, or `null`
 * to deny. Runs again on every `GET /files/:token` request, not only when the
 * URL is issued (technical.md §S6) — a caller who loses access loses it at
 * once, even with a still-valid token.
 */
export type FileAccessPolicy = (
  ref: InternalFileRef,
  userId: string,
) => Promise<ResolvedFile | null> | ResolvedFile | null;

/**
 * Holds the access policies referencing features contribute, keyed by
 * {@link FileRefKind} (conversations registers `attachment` and
 * `message_preview`, link previews register `preview`). Server-core grants
 * nothing on its own — a kind with no registered policy always denies.
 */
@Injectable()
export class FileAccessRegistry {
  private readonly policies = new Map<FileRefKind, FileAccessPolicy[]>();

  register(kind: FileRefKind, policy: FileAccessPolicy): void {
    const list = this.policies.get(kind) ?? [];
    list.push(policy);
    this.policies.set(kind, list);
  }

  async resolve(ref: InternalFileRef, userId: string): Promise<ResolvedFile | null> {
    for (const policy of this.policies.get(ref.kind) ?? []) {
      const resolved = await policy(ref, userId);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }
}
