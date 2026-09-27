import type { EkozClient, FileRef } from '@ekozhq/sdk';
import { SignedUrlCache } from '@ekozhq/sdk';
import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * One `SignedUrlCache` per SDK client, so every `useFileUrl` call in the app
 * batches into the same `POST /files/urls` request within a tick and shares
 * the 60s-before-expiry refresh (technical.md §6).
 */
const caches = new WeakMap<EkozClient, SignedUrlCache>();

function cacheFor(sdk: EkozClient): SignedUrlCache {
  let cache = caches.get(sdk);
  if (!cache) {
    cache = new SignedUrlCache(sdk.files);
    caches.set(sdk, cache);
  }
  return cache;
}

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

/**
 * Short-lived signed URL for `ref`, or `undefined` while loading or when the
 * server denied access. `ref` may be `null` to disable the query (e.g. no
 * thumbnail variant for this attachment).
 */
export function useFileUrl(ref: FileRef | null): string | undefined {
  const sdk = useSdk();

  const query = useQuery({
    queryKey: ['file-url', ref ? refKey(ref) : null],
    queryFn: () => {
      if (!sdk || !ref) throw new Error('File URL not available');
      return cacheFor(sdk).get(ref);
    },
    staleTime: 30_000,
    enabled: sdk !== null && ref !== null,
  });

  return query.data;
}
