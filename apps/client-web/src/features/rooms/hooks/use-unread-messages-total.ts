import { useRooms } from '@/features/rooms/hooks/use-room-queries';

/** Unread messages over every room of the caller (`null` counters count as 0). */
export function useUnreadMessagesTotal(): number {
  return (useRooms().data?.items ?? []).reduce((sum, room) => sum + (room.unreadCount ?? 0), 0);
}
