import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in account (`GET /me`), fetched once the SDK client is available. */
export function useMe() {
  const sdk = useSdk();

  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.me.get();
    },
    enabled: sdk !== null,
  });
}
