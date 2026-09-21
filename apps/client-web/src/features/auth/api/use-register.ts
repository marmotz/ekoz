import type { RegisterBody } from '@ekozhq/sdk';
import { useMutation } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** `POST /auth/register`; returns no tokens, the account signs in afterwards. */
export function useRegister() {
  const sdk = useSdk();

  return useMutation({
    mutationFn: (body: RegisterBody) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.auth.register(body);
    },
  });
}
