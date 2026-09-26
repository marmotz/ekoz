import type { ParseKeys } from 'i18next';
import { Ellipsis, Pencil, Pin, PinOff, Reply, Smile, Trash } from 'lucide-react';
import type { ComponentType, ReactElement, ReactNode } from 'react';

import type { MessageAction } from '@/features/chat/lib/message-actions';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

/** What each action runs; an action without a handler is not listed. */
export type MessageMenuHandlers = Partial<Record<MessageAction, () => void>>;

const ITEMS: Record<
  MessageAction,
  { key: ParseKeys; icon: ComponentType<{ className?: string }>; destructive?: boolean }
> = {
  reply: { key: 'chat.actions.reply', icon: Reply },
  react: { key: 'chat.actions.react', icon: Smile },
  edit: { key: 'chat.actions.edit', icon: Pencil },
  pin: { key: 'chat.actions.pin', icon: Pin },
  unpin: { key: 'chat.actions.unpin', icon: PinOff },
  delete: { key: 'chat.actions.delete', icon: Trash, destructive: true },
};

export interface MessageMenuProps {
  /** From `availableActions`; the menu lists these, in the order given, that have a handler. */
  actions: readonly MessageAction[];
  handlers: MessageMenuHandlers;
  /** The message row, given the "..." button to place inside it (or `null` when there is no menu). */
  children: (moreButton: ReactNode) => ReactElement;
}

/**
 * The actions of a message on two surfaces fed by one list, so they cannot diverge: a
 * context menu on the row (right click, long press) and a "..." button opening a
 * dropdown. With no action to offer there is no menu and no button.
 */
export function MessageMenu({ actions, handlers, children }: MessageMenuProps) {
  const { t } = useTranslation();
  const listed = actions.filter((action) => handlers[action]);
  if (listed.length === 0) return children(null);

  const renderItems = (Item: typeof ContextMenuItem | typeof DropdownMenuItem) =>
    listed.map((action) => {
      const { key, icon: Icon, destructive } = ITEMS[action];
      return (
        <Item
          key={action}
          onSelect={() => handlers[action]?.()}
          className={cn(destructive && 'text-destructive focus:text-destructive')}
        >
          <Icon className="size-4" aria-hidden="true" />
          {t(key)}
        </Item>
      );
    });

  const moreButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('chat.actions.more')}
          className="absolute -top-2 right-1 size-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{renderItems(DropdownMenuItem)}</DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children(moreButton)}</ContextMenuTrigger>
      <ContextMenuContent>{renderItems(ContextMenuItem)}</ContextMenuContent>
    </ContextMenu>
  );
}
