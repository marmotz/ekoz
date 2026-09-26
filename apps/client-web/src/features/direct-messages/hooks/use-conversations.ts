import { useQuery } from '@tanstack/react-query';

import { conversationQueries } from '@/features/direct-messages/api/queries';
import { useSdk } from '@/shared/sdk/use-sdk';

/** The caller's direct and group conversations, in server order (newest activity first). */
export function useConversations() {
  return useQuery({ ...conversationQueries.list(useSdk()), refetchOnWindowFocus: true });
}
