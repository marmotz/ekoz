import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useSdk } from '@/shared/sdk/use-sdk';

/** The `v` cache-busting parameter of a versioned `avatarUrl`, if any. */
function versionOf(avatarUrl: string): string | undefined {
  try {
    return new URL(avatarUrl, 'http://localhost').searchParams.get('v') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Object URL of a user's avatar, or `null` while loading, on error and when there
 * is none. The avatar route needs a Bearer token, so `<img src>` cannot load it:
 * the blob goes through the SDK. The `avatarUrl` is versioned, so a new upload
 * changes the query key and refetches without any manual invalidation.
 */
export function useAvatarSrc(
  identifier: string | null | undefined,
  avatarUrl: string | null | undefined,
): string | null {
  const sdk = useSdk();
  const enabled = sdk !== null && Boolean(identifier) && Boolean(avatarUrl);

  const query = useQuery({
    queryKey: ['avatar', avatarUrl],
    queryFn: () => {
      if (!sdk || !identifier || !avatarUrl) throw new Error('Avatar not available');
      return sdk.users.avatar(identifier, { version: versionOf(avatarUrl) });
    },
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });

  const [src, setSrc] = useState<string | null>(null);
  const blob = enabled ? query.data : undefined;

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // The object URL only exists in the browser and must be revoked on cleanup, so it cannot be derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
      setSrc(null);
    };
  }, [blob]);

  return blob ? src : null;
}
