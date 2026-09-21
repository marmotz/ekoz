import { useQuery } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * The server's authentication policy (`GET /auth/policy`): registration mode, whether
 * an email must be verified, minimum password length. `staleTime: 0` so a setting
 * changed on the server shows on the next visit; the global 30 s default is too long here.
 */
export function useAuthPolicy() {
  const sdk = useSdk();

  return useQuery({
    queryKey: ['auth', 'policy'],
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.auth.policy();
    },
    enabled: sdk !== null,
    staleTime: 0,
  });
}
