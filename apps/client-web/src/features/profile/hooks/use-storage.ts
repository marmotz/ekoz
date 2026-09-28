import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

export const STORAGE_QUERY_KEY = ['me', 'storage'] as const;

/** The signed-in account's storage usage and quota (`GET /me/storage`). */
export function useStorage() {
  const sdk = useSdk();

  return useQuery({
    queryKey: STORAGE_QUERY_KEY,
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.me.storage();
    },
    enabled: sdk !== null,
  });
}
