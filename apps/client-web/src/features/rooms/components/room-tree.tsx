import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Folder, Hash } from 'lucide-react';
import type { RoomNode } from '@/features/rooms/components/build-room-tree';
import { MentionBadge } from '@/features/rooms/components/mention-badge';
import { UnreadBadge } from '@/features/rooms/components/unread-badge';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { useRoomHasTyping } from '@/shared/realtime/typing-store';
import { useDirectPresence } from '@/shared/realtime/use-direct-presence';
import { PresenceDot } from '@/shared/ui/presence-dot';

interface RoomTreeProps {
  nodes: readonly RoomNode[];
  collapsed: ReadonlySet<string>;
  onToggle: (roomId: string) => void;
  onNavigate?: () => void;
}

const rowClass = 'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm';

/**
 * The rooms tree of the sidebar. `context` nodes (ancestor spaces the caller only
 * sees to place a room) are plain headers; `member` and `inherited` nodes link to the
 * room. A space with children can be collapsed.
 */
export function RoomTree({ nodes, collapsed, onToggle, onNavigate }: RoomTreeProps) {
  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <RoomTreeItem
          key={node.room.id}
          node={node}
          collapsed={collapsed}
          onToggle={onToggle}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function RoomTreeItem({
  node,
  collapsed,
  onToggle,
  onNavigate,
}: Omit<RoomTreeProps, 'nodes'> & { node: RoomNode }) {
  const { t } = useTranslation();
  const { room, children } = node;
  const name = room.name ?? t('rooms.unnamed');
  const isCollapsed = collapsed.has(room.id);
  const directPresence = useDirectPresence(room.id, room.type);
  const Icon = room.type === 'space' ? Folder : Hash;
  // A space holds no message: it shows the sum of its descendants while collapsed, never its own count.
  const unread =
    room.type === 'space' ? (isCollapsed ? node.descendantsUnread : null) : room.unreadCount;

  return (
    <li>
      <div className="flex items-center">
        {children.length > 0 ? (
          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={t(isCollapsed ? 'rooms.sidebar.expand' : 'rooms.sidebar.collapse', {
              name,
            })}
            onClick={() => onToggle(room.id)}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        {room.access === 'context' ? (
          <span className={cn(rowClass, 'font-medium text-muted-foreground')}>
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{name}</span>
          </span>
        ) : (
          <Link
            to="/rooms/$roomId"
            params={{ roomId: room.id }}
            onClick={onNavigate}
            className={cn(
              rowClass,
              'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
            activeProps={{ className: 'bg-accent text-accent-foreground' }}
          >
            {({ isActive }) => (
              <>
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{name}</span>
                {directPresence ? <PresenceDot status={directPresence} /> : null}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  {isActive ? null : <TypingIndicator roomId={room.id} />}
                  <MentionBadge roomId={room.id} />
                  <UnreadBadge count={unread} />
                </span>
              </>
            )}
          </Link>
        )}
      </div>
      {children.length > 0 && !isCollapsed && (
        <div className="pl-4">
          <RoomTree
            nodes={children}
            collapsed={collapsed}
            onToggle={onToggle}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </li>
  );
}

/** Animated dots while someone types in a room the user is not looking at. */
function TypingIndicator({ roomId }: { roomId: string }) {
  const { t } = useTranslation();
  if (!useRoomHasTyping(roomId)) return null;

  return (
    <span
      role="img"
      aria-label={t('chat.typing.indicator')}
      className="flex items-center gap-0.5 text-muted-foreground"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
