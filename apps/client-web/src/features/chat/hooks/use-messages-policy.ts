import { useQuery } from '@tanstack/react-query';

import { chatKeys } from '@/features/chat/api/query-keys';
import { useSdk } from '@/shared/sdk/use-sdk';

/**
 * The limits the server applies to message bodies (`GET /messages/policy`). The limit is
 * a runtime setting: refetched after a minute, and invalidated when a send is refused
 * with `message.body_too_long` so a limit lowered on the server is picked up.
 */
export function useMessagesPolicy() {
  const sdk = useSdk();

  return useQuery({
    queryKey: chatKeys.messagesPolicy(),
    queryFn: () => {
      if (!sdk) throw new Error('SDK not started');
      return sdk.messages.policy();
    },
    enabled: sdk !== null,
    staleTime: 60_000,
  });
}
