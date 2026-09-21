import type { ResendVerificationBody } from '@ekozhq/sdk';
import { useMutation } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** `POST /auth/verify-email/resend`; the server always answers `202`, whether or not the address exists. */
export function useResendVerification() {
  const sdk = useSdk();

  return useMutation({
    mutationFn: (body: ResendVerificationBody) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.auth.resendVerification(body);
    },
  });
}
