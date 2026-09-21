import type { ConfirmPasswordResetBody } from '@ekozhq/sdk';
import { useMutation } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** `POST /auth/password-reset/confirm`; revokes every session of the account. */
export function useConfirmPasswordReset() {
  const sdk = useSdk();

  return useMutation({
    mutationFn: (body: ConfirmPasswordResetBody) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.auth.confirmPasswordReset(body);
    },
  });
}
