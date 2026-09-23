import type { SessionView } from '@ekozhq/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { SESSIONS_KEY } from '@/features/profile/api/query-keys';
import { useStartedSdk } from '@/features/profile/hooks/sdk-call';
import { useSdk } from '@/shared/sdk/use-sdk';

/** Active sessions only (the server also lists revoked ones), most recently seen first. */
function activeSessions(sessions: SessionView[]): SessionView[] {
  return sessions
    .filter((session) => session.revokedAt === null)
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
}

/** `GET /sessions`, filtered and sorted. */
export function useSessions() {
  const sdk = useSdk();

  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.sessions.list();
    },
    select: activeSessions,
    enabled: sdk !== null,
  });
}

/** `PATCH /sessions/:id`. */
export function useRenameSession() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deviceName }: { id: string; deviceName: string }) =>
      sdk().sessions.rename(id, { deviceName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

/** `DELETE /sessions/:id`. */
export function useRevokeSession() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => sdk().sessions.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

/** `DELETE /sessions?all=true`: resolves with the number of sessions revoked. */
export function useRevokeOtherSessions() {
  const sdk = useStartedSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => sdk().sessions.revokeAllOthers(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}
