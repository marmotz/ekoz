import type { ChangeEmailBody, ChangePasswordBody, ChangeUsernameBody } from '@ekozhq/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ME_KEY, SESSIONS_KEY, USERNAME_STATE_KEY } from '@/features/profile/api/query-keys';
import { useStartedSdk } from '@/features/profile/hooks/sdk-call';
import { useSdk } from '@/shared/sdk/use-sdk';

/** `POST /me/email`; a pending address shows up on the account, so `['me']` is refetched. */
export function useChangeEmail() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ChangeEmailBody) => sdk().me.changeEmail(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

/** `GET /me/username`: policy, next change date and pending request. */
export function useUsernameState() {
  const sdk = useSdk();

  return useQuery({
    queryKey: USERNAME_STATE_KEY,
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.me.usernameState();
    },
    enabled: sdk !== null,
  });
}

/** `PATCH /me/username`: `applied` changes the identifier, `pending` waits for approval. */
export function useChangeUsername() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ChangeUsernameBody) => sdk().me.changeUsername(body),
    onSuccess: async (outcome) => {
      const invalidations = [queryClient.invalidateQueries({ queryKey: USERNAME_STATE_KEY })];
      if (outcome.status === 'applied') {
        invalidations.push(queryClient.invalidateQueries({ queryKey: ME_KEY }));
      }
      await Promise.all(invalidations);
    },
  });
}

/** `DELETE /me/username/request`. */
export function useCancelUsernameRequest() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sdk().me.cancelUsernameRequest(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERNAME_STATE_KEY }),
  });
}

/** `POST /me/password`; the server revokes every other session, so the sessions list is refetched. */
export function useChangePassword() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ChangePasswordBody) => sdk().me.changePassword(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}
