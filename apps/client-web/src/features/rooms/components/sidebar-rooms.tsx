import { Link } from '@tanstack/react-router';
import { Compass, Mail, Plus } from 'lucide-react';
import { useMemo } from 'react';

import { buildRoomTree } from '@/features/rooms/components/build-room-tree';
import { useCollapsedRooms } from '@/features/rooms/components/collapsed-rooms';
import { RoomTree } from '@/features/rooms/components/room-tree';
import { useInvitations, useRooms } from '@/features/rooms/hooks/use-room-queries';
import { DIRECTORY_PATH, INVITATIONS_PATH, NEW_ROOM_PATH } from '@/features/rooms/lib/paths';
import { useTranslation } from '@/shared/i18n/use-translation';
import type { SidebarSectionProps } from '@/shared/layout/sidebar-section-registry';
import { cn } from '@/shared/lib/utils';
import { useSession } from '@/shared/sdk/session';
import { Skeleton } from '@/shared/ui/skeleton';

const headerLinkClass = cn(
  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
);

/** The rooms section of the sidebar; nothing unless the session is signed in. */
export function SidebarRooms(props: SidebarSectionProps) {
  const { status } = useSession();

  if (status !== 'authenticated') return null;
  return <SidebarRoomsContent {...props} />;
}

function SidebarRoomsContent({ onNavigate }: SidebarSectionProps) {
  const { t } = useTranslation();
  const rooms = useRooms();
  const invitations = useInvitations();
  const { collapsed, toggle } = useCollapsedRooms();
  const tree = useMemo(() => buildRoomTree(rooms.data?.items ?? []), [rooms.data]);
  const pending = invitations.data?.items.length ?? 0;

  return (
    <section aria-labelledby="sidebar-rooms-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-3">
        <Link
          id="sidebar-rooms-title"
          to="/rooms"
          onClick={onNavigate}
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
        >
          {t('rooms.sidebar.label')}
        </Link>
      </div>
      <div className="flex flex-wrap gap-1 px-1">
        <Link to={NEW_ROOM_PATH} onClick={onNavigate} className={headerLinkClass}>
          <Plus className="size-3.5" />
          {t('rooms.sidebar.new')}
        </Link>
        <Link to={DIRECTORY_PATH} onClick={onNavigate} className={headerLinkClass}>
          <Compass className="size-3.5" />
          {t('rooms.sidebar.directory')}
        </Link>
        <Link to={INVITATIONS_PATH} onClick={onNavigate} className={headerLinkClass}>
          <Mail className="size-3.5" />
          {t('rooms.sidebar.invitations')}
          {pending > 0 && (
            <span
              role="status"
              aria-label={t('rooms.sidebar.pendingInvitations', { count: pending })}
              className="rounded-full bg-primary px-1.5 text-[0.65rem] leading-4 text-primary-foreground"
            >
              {pending}
            </span>
          )}
        </Link>
      </div>
      {rooms.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-1 px-3">
          <span className="sr-only">{t('rooms.sidebar.loading')}</span>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      ) : rooms.isError ? (
        <p className="px-3 text-sm text-destructive">{t('rooms.sidebar.error')}</p>
      ) : tree.length === 0 ? (
        <p className="px-3 text-sm text-muted-foreground">{t('rooms.sidebar.empty')}</p>
      ) : (
        <RoomTree nodes={tree} collapsed={collapsed} onToggle={toggle} onNavigate={onNavigate} />
      )}
    </section>
  );
}
