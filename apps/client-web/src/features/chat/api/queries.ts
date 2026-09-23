import type { EkozClient, Member } from '@ekozhq/sdk';

import { mergeFirstPage, type Timeline } from '@/features/chat/lib/timeline';

/** The members list is loaded in pages until the cursor runs out, up to this many. */
export const MAX_MEMBER_PAGES = 5;

/** Newest page of a room's history, as a fresh timeline (`GET /rooms/:id/messages`). */
export async function fetchFirstPage(sdk: EkozClient, roomId: string): Promise<Timeline> {
  return mergeFirstPage(await sdk.messages.list(roomId));
}

/** The page of messages strictly before `before` (a `seq`). */
export function fetchOlderPage(sdk: EkozClient, roomId: string, before: string) {
  return sdk.messages.list(roomId, { before });
}

/** Members of a room, following `nextCursor` (`GET /rooms/:id/members`). */
export async function fetchMembers(sdk: EkozClient, roomId: string): Promise<Member[]> {
  const members: Member[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_MEMBER_PAGES; page += 1) {
    const result = await sdk.rooms.members(roomId, cursor ? { cursor } : undefined);
    members.push(...result.items);
    if (result.nextCursor === null) break;
    cursor = result.nextCursor;
  }

  return members;
}
