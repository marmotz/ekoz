import { useAuthorLabel } from '@/features/chat/hooks/use-author-label';
import { useAuthors } from '@/features/chat/hooks/use-authors';
import type { Reaction } from '@/features/chat/lib/timeline';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';

export interface ReactionBarProps {
  roomId: string;
  reactions: readonly Reaction[];
  /** The caller's account id: their reactions are highlighted. */
  myId: string | null;
  /** Whether the caller can react (`room.react`); chips are display-only otherwise. */
  canReact: boolean;
  onToggle: (emoji: string) => void;
}

function Reactors({ roomId, userIds }: { roomId: string; userIds: readonly string[] }) {
  const { t } = useTranslation();
  const label = useAuthorLabel();
  const { resolve } = useAuthors(roomId, userIds);
  const names = userIds.map((userId) => {
    const author = resolve(userId);
    return author.kind === 'pending' ? t('chat.reactions.unknownUser') : label(author);
  });
  return <>{names.join(', ')}</>;
}

/**
 * One chip per emoji under a message: the emoji and how many reacted, highlighted when
 * the caller is one of them. Clicking toggles the caller's reaction (with `room.react`);
 * hover and focus list who reacted.
 */
export function ReactionBar({ roomId, reactions, myId, canReact, onToggle }: ReactionBarProps) {
  const { t } = useTranslation();
  if (reactions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <ul className="mt-1 flex flex-wrap gap-1" aria-label={t('chat.reactions.label')}>
        {reactions.map(({ emoji, userIds }) => {
          const mine = myId !== null && userIds.includes(myId);
          const className = cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
            mine ? 'border-primary bg-primary/15' : 'bg-muted/50',
            canReact ? 'cursor-pointer hover:bg-accent' : 'cursor-default',
          );
          const content = (
            <>
              <span aria-hidden="true">{emoji}</span>
              <span>{userIds.length}</span>
            </>
          );
          const name = t('chat.reactions.chip', { emoji, count: userIds.length });

          return (
            <li key={emoji}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={className}
                    aria-label={name}
                    aria-pressed={mine}
                    aria-disabled={!canReact}
                    onClick={() => {
                      if (canReact) onToggle(emoji);
                    }}
                  >
                    {content}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <Reactors roomId={roomId} userIds={userIds} />
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
