import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** The signed-in account (`GET /me`), fetched once the SDK client is available. */
export function useMe() {
  const sdk = useSdk();

  return useQuery({
    queryKey: ['me'],
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.me.get();
    },
    enabled: sdk !== null,
  });
}
