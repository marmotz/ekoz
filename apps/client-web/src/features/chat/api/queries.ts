import type { EkozClient } from '@ekozhq/sdk';

import { mergeFirstPage, type Timeline } from '@/features/chat/lib/timeline';

/** Newest page of a room's history, as a fresh timeline (`GET /rooms/:id/messages`). */
export async function fetchFirstPage(sdk: EkozClient, roomId: string): Promise<Timeline> {
  return mergeFirstPage(await sdk.messages.list(roomId));
}

/** The page of messages strictly before `before` (a `seq`). */
export function fetchOlderPage(sdk: EkozClient, roomId: string, before: string) {
  return sdk.messages.list(roomId, { before });
}
