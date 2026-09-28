import { EkozError, NetworkError } from '@ekozhq/sdk';
import { useCallback, useRef, useState } from 'react';

import { useSdk } from '@/shared/sdk/use-sdk';

export type UploadErrorCode =
  | 'upload.quota_exceeded'
  | 'upload.too_large'
  | 'upload.type_rejected'
  | 'upload.capacity_exceeded'
  | 'upload.expired'
  | 'network'
  | 'unknown';

const KNOWN_ERROR_CODES: readonly UploadErrorCode[] = [
  'upload.quota_exceeded',
  'upload.too_large',
  'upload.type_rejected',
  'upload.capacity_exceeded',
  'upload.expired',
];

export interface UploadEntry {
  localId: string;
  file: File;
  uploadId: string | null;
  state: 'uploading' | 'ready' | 'failed';
  /** 0-100. */
  progress: number;
  error?: UploadErrorCode;
  /** Object URL for an image file, revoked when the entry is removed or handed off. */
  previewUrl: string | null;
}

/**
 * The composer's own cap on attachments per message (technical.md §S9's documented
 * default for `attachments.max_per_message`). The server has no policy endpoint for
 * this or for upload size limits, so it stays the arbiter: a refusal still surfaces
 * as `upload.too_large` / `message.attachment_limit_exceeded` from the server.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

let localCounter = 0;

function errorCodeOf(error: unknown): UploadErrorCode {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof EkozError) {
    return (KNOWN_ERROR_CODES as string[]).includes(error.code)
      ? (error.code as UploadErrorCode)
      : 'unknown';
  }
  return 'unknown';
}

/**
 * The composer's attachment tray: one upload per file, tracked from `uploading`
 * to `ready` or `failed`, with a local preview for images (technical.md §6).
 */
export function useComposerUploads() {
  const sdk = useSdk();
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((localId: string, changes: Partial<UploadEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.localId === localId ? { ...entry, ...changes } : entry)),
    );
  }, []);

  const runUpload = useCallback(
    async (localId: string, file: File) => {
      if (!sdk) return;
      const controller = new AbortController();
      controllers.current.set(localId, controller);
      try {
        const handle = await sdk.uploads.upload(file, {
          signal: controller.signal,
          onProgress: (sent, total) => {
            patch(localId, { progress: total > 0 ? Math.round((sent / total) * 100) : 0 });
          },
        });
        patch(localId, { uploadId: handle.id });
        const result = await handle.promise;
        if (result.state === 'ready') {
          patch(localId, { state: 'ready', progress: 100 });
        } else {
          patch(localId, { state: 'failed', error: 'unknown' });
        }
      } catch (error) {
        patch(localId, { state: 'failed', error: errorCodeOf(error) });
      } finally {
        controllers.current.delete(localId);
      }
    },
    [sdk, patch],
  );

  const add = useCallback(
    (files: File[]) => {
      setEntries((current) => {
        const room = MAX_ATTACHMENTS_PER_MESSAGE - current.length;
        const accepted = files.slice(0, Math.max(0, room));
        const added = accepted.map((file) => {
          localCounter += 1;
          const localId = `upload-${Date.now()}-${localCounter}`;
          const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
          void runUpload(localId, file);
          return {
            localId,
            file,
            uploadId: null,
            state: 'uploading' as const,
            progress: 0,
            previewUrl,
          };
        });
        return [...current, ...added];
      });
    },
    [runUpload],
  );

  const remove = useCallback(
    (localId: string) => {
      controllers.current.get(localId)?.abort();
      controllers.current.delete(localId);
      setEntries((current) => {
        const entry = current.find((candidate) => candidate.localId === localId);
        if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
        if (entry?.uploadId && sdk) void sdk.uploads.cancel(entry.uploadId).catch(() => {});
        return current.filter((candidate) => candidate.localId !== localId);
      });
    },
    [sdk],
  );

  const retry = useCallback(
    (localId: string) => {
      const entry = entries.find((candidate) => candidate.localId === localId);
      if (!entry) return;
      patch(localId, { state: 'uploading', progress: 0, error: undefined, uploadId: null });
      void runUpload(localId, entry.file);
    },
    [entries, patch, runUpload],
  );

  /**
   * Detaches the ready entries for an outgoing message without revoking their preview
   * urls: ownership moves to the caller (the pending message), which must revoke them
   * once it is reconciled or abandoned. Failed entries stay in the tray.
   */
  const takeReady = useCallback(() => {
    const ready = entries.filter((entry) => entry.state === 'ready');
    if (ready.length > 0) {
      const readyIds = new Set(ready.map((entry) => entry.localId));
      setEntries((current) => current.filter((entry) => !readyIds.has(entry.localId)));
    }
    return ready;
  }, [entries]);

  const readyIds = entries
    .filter((entry) => entry.state === 'ready' && entry.uploadId !== null)
    .map((entry) => entry.uploadId as string);
  const busy = entries.some((entry) => entry.state === 'uploading');
  const atLimit = entries.length >= MAX_ATTACHMENTS_PER_MESSAGE;

  return { entries, add, remove, retry, takeReady, readyIds, busy, atLimit };
}
