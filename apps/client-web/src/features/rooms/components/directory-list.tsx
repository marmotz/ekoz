import { Link, useNavigate } from '@tanstack/react-router';
import { Hash } from 'lucide-react';
import { useEffect, useState } from 'react';

import { hasRoomErrorCode, roomErrorKey } from '@/features/rooms/api/errors';
import { useJoinRoom } from '@/features/rooms/hooks/use-room-mutations';
import { useDirectory, useRooms } from '@/features/rooms/hooks/use-room-queries';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';

/** Delay between the last keystroke and the directory search. */
export const SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * `/rooms/directory`: public channels, searched and paged (technical design 4.8).
 * A channel the caller already reads opens; any other one can be joined.
 */
export function DirectoryList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const directory = useDirectory(query);
  const rooms = useRooms();
  const join = useJoinRoom();

  const readable = new Set(
    (rooms.data?.items ?? [])
      .filter((item) => item.access === 'member' || item.access === 'inherited')
      .map((item) => item.id),
  );
  const items = directory.data?.pages.flatMap((page) => page.items) ?? [];

  const joinRoom = (roomId: string) => {
    const open = () => void navigate({ to: '/rooms/$roomId', params: { roomId } });
    join.mutate(roomId, {
      onSuccess: open,
      // Already a member: the list was stale, the room can be opened all the same.
      onError: (error) => {
        if (hasRoomErrorCode(error, 'room.already_member')) open();
      },
    });
  };
  const joinError =
    join.error && !hasRoomErrorCode(join.error, 'room.already_member') ? join.error : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-bold">{t('rooms.directory.title')}</h2>
      <Input
        type="search"
        aria-label={t('rooms.directory.search')}
        placeholder={t('rooms.directory.search')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {directory.isPending ? (
        <div role="status" aria-label={t('rooms.directory.loading')} className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : directory.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">{t('rooms.directory.error')}</p>
          <Button type="button" variant="outline" onClick={() => void directory.refetch()}>
            {t('rooms.directory.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(query === '' ? 'rooms.directory.empty' : 'rooms.directory.noMatch')}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((room) => (
            <li key={room.id} className="flex flex-wrap items-center gap-3 p-3">
              <Hash className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{room.name ?? t('rooms.unnamed')}</p>
                {room.topic && (
                  <p className="truncate text-xs text-muted-foreground">{room.topic}</p>
                )}
              </div>
              {readable.has(room.id) ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/rooms/$roomId" params={{ roomId: room.id }}>
                    {t('rooms.directory.open')}
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={join.isPending}
                  onClick={() => joinRoom(room.id)}
                >
                  {t('rooms.directory.join')}
                </Button>
              )}
              {joinError && join.variables === room.id && (
                <p role="alert" className="w-full text-sm text-destructive">
                  {t(roomErrorKey(joinError))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {directory.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          disabled={directory.isFetchingNextPage}
          onClick={() => void directory.fetchNextPage()}
        >
          {t('rooms.directory.loadMore')}
        </Button>
      )}
    </div>
  );
}
