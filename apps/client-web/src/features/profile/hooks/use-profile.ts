import type { MeView, UpdateProfileBody } from '@ekozhq/sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ME_KEY } from '@/features/profile/api/query-keys';
import { useStartedSdk } from '@/features/profile/hooks/sdk-call';

/** `PATCH /me/profile`; the answer is the whole account, so it replaces the `['me']` cache. */
export function useUpdateProfile() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateProfileBody) => sdk().me.updateProfile(body),
    onSuccess: (me) => queryClient.setQueryData<MeView>(ME_KEY, me),
  });
}

/** `PUT /me/avatar`; the versioned `avatarUrl` replaces the one in the `['me']` cache. */
export function useSetAvatar() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: Blob) => sdk().me.setAvatar(file),
    onSuccess: ({ avatarUrl }) =>
      queryClient.setQueryData<MeView>(ME_KEY, (me) => (me ? { ...me, avatarUrl } : me)),
  });
}

/** `DELETE /me/avatar`. */
export function useDeleteAvatar() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sdk().me.deleteAvatar(),
    onSuccess: () =>
      queryClient.setQueryData<MeView>(ME_KEY, (me) => (me ? { ...me, avatarUrl: null } : me)),
  });
}
