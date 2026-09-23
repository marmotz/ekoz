import type { DeleteMeBody } from '@ekozhq/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useStartedSdk } from '@/features/profile/hooks/sdk-call';

/**
 * `DELETE /me`. The SDK clears the session, which sends `RequireAuth` to `/login`;
 * nothing of the account may stay in the query cache, so it is cleared too.
 */
export function useDeleteAccount() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: DeleteMeBody) => sdk().me.deleteAccount(body),
    onSuccess: () => queryClient.clear(),
  });
}
