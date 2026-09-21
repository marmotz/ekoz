import type { RequestPasswordResetBody } from '@ekozhq/sdk';
import { useMutation } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** `POST /auth/password-reset/request`; always answers `202`, whether or not the address exists. */
export function useRequestPasswordReset() {
  const sdk = useSdk();

  return useMutation({
    mutationFn: (body: RequestPasswordResetBody) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.auth.requestPasswordReset(body);
    },
  });
}
