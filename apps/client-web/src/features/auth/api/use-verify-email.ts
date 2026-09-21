import type { VerifyEmailBody } from '@ekozhq/sdk';
import { useMutation } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** `POST /auth/verify-email`; the token is single-use. */
export function useVerifyEmail() {
  const sdk = useSdk();

  return useMutation({
    mutationFn: (body: VerifyEmailBody) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.auth.verifyEmail(body);
    },
  });
}
