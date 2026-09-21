import type { LoginBody } from '@ekozhq/sdk';
import { useMutation } from '@tanstack/react-query';

import { useSdk } from '@/shared/sdk/use-sdk';

/** `POST /auth/login`; the SDK establishes the session and emits `session:authenticated`. */
export function useLogin() {
  const sdk = useSdk();

  return useMutation({
    mutationFn: (body: LoginBody) => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.auth.login(body);
    },
  });
}
