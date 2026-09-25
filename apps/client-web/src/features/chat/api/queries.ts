import type { EkozClient } from '@ekozhq/sdk';

import { mergeFirstPage, type Timeline } from '@/features/chat/lib/timeline';

/**
 * First page of a room's history as a fresh timeline (`GET /rooms/:id/messages`): the
 * newest one, or, with `at` (a `seq`), the window around that message.
 */
export async function fetchFirstPage(
  sdk: EkozClient,
  roomId: string,
  at?: string,
): Promise<Timeline> {
  return mergeFirstPage(
    await (at ? sdk.messages.list(roomId, { around: at }) : sdk.messages.list(roomId)),
  );
}

/** The page of messages strictly before `before` (a `seq`). */
export function fetchOlderPage(sdk: EkozClient, roomId: string, before: string) {
  return sdk.messages.list(roomId, { before });
}

/** The page of messages strictly after `after` (a `seq`). */
export function fetchNewerPage(sdk: EkozClient, roomId: string, after: string) {
  return sdk.messages.list(roomId, { after });
}
