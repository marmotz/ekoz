import { lazy, Suspense } from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { Popover, PopoverAnchor, PopoverContent } from '@/shared/ui/popover';

const ReactionEmojiPicker = lazy(() => import('@/features/chat/components/reaction-emoji-picker'));

export interface ReactionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the emoji character; the picker closes. */
  onPick: (emoji: string) => void;
}

/**
 * The reaction picker of a message: a popover anchored to the message row (this
 * component goes inside it), opened by the "React" item of the menu. The emoji picker
 * itself is loaded the first time it opens.
 */
export function ReactionPicker({ open, onOpenChange, onPick }: ReactionPickerProps) {
  const { t } = useTranslation();

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span aria-hidden="true" className="pointer-events-none absolute top-0 right-2 size-0" />
      </PopoverAnchor>
      <PopoverContent
        align="end"
        className="w-auto rounded-none border-0 bg-transparent p-0 shadow-none"
        aria-label={t('chat.reactions.picker')}
      >
        <Suspense
          fallback={
            <p className="p-4 text-sm text-muted-foreground">{t('chat.reactions.loading')}</p>
          }
        >
          <ReactionEmojiPicker
            onPick={(emoji) => {
              onPick(emoji);
              onOpenChange(false);
            }}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
