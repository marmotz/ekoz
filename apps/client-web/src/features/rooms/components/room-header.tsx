import type { Room, RoomListItem } from '@ekozhq/sdk';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ParseKeys } from 'i18next';
import { Folder, Hash, UserPlus } from 'lucide-react';

import { roomErrorKey } from '@/features/rooms/api/errors';
import { useLeaveRoom } from '@/features/rooms/hooks/use-room-mutations';
import { useRooms } from '@/features/rooms/hooks/use-room-queries';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

const TYPE_LABEL: Record<Room['type'], ParseKeys> = {
  space: 'rooms.header.type.space',
  channel: 'rooms.header.type.channel',
  dm: 'rooms.header.type.dm',
  group_dm: 'rooms.header.type.groupDm',
};

export interface RoomHeaderProps {
  room: Room | RoomListItem;
  capabilities: readonly string[];
}

/**
 * Name, topic and type of a room. Leave is offered for an explicit membership only
 * (`access: "member"`): leaving an inherited access answers `room.membership_not_found`.
 * A space lists its channels from the cached rooms list; moderators get a link to the
 * pending join requests.
 */
export function RoomHeader({ room, capabilities }: RoomHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const rooms = useRooms();
  const leave = useLeaveRoom();

  const items = rooms.data?.items ?? [];
  const listed = items.find((item) => item.id === room.id);
  const channels = room.type === 'space' ? items.filter((item) => item.parentId === room.id) : [];
  const Icon = room.type === 'space' ? Folder : Hash;

  return (
    <header className="space-y-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Icon className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{room.name ?? t('rooms.unnamed')}</h2>
          <p className="text-xs text-muted-foreground">{t(TYPE_LABEL[room.type])}</p>
        </div>
        {capabilities.includes('room.manage_members') && (
          <Button asChild size="sm" variant="outline">
            <Link to="/rooms/$roomId/requests" params={{ roomId: room.id }}>
              <UserPlus />
              {t('rooms.header.requests')}
            </Link>
          </Button>
        )}
        {listed?.access === 'member' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={leave.isPending}
            onClick={() =>
              leave.mutate(room.id, { onSuccess: () => void navigate({ to: '/rooms' }) })
            }
          >
            {t('rooms.header.leave')}
          </Button>
        )}
      </div>
      {room.topic && <p className="text-sm text-muted-foreground">{room.topic}</p>}
      {leave.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(roomErrorKey(leave.error))}
        </p>
      )}
      {room.type === 'space' && (
        <nav aria-label={t('rooms.header.channels')} className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('rooms.header.channels')}
          </p>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('rooms.header.noChannels')}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {channels.map((channel) => (
                <li key={channel.id}>
                  <Link
                    to="/rooms/$roomId"
                    params={{ roomId: channel.id }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <Hash className="size-3.5" />
                    {channel.name ?? t('rooms.unnamed')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      )}
    </header>
  );
}
