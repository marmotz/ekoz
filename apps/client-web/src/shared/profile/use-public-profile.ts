import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

export const publicProfileKey = (identifier: string) => ['users', 'profile', identifier] as const;

/** A public profile (`GET /users/:identifier`); a deleted account answers `404`. */
export function usePublicProfile(identifier: string) {
  const sdk = useSdk();

  return useQuery({
    queryKey: publicProfileKey(identifier),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.users.getProfile(identifier);
    },
    enabled: sdk !== null,
  });
}
