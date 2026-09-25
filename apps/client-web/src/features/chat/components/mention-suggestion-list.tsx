import { Fragment } from 'react';

import {
  type MentionSuggestion,
  SUGGESTION_LISTBOX_ID,
  SUGGESTION_SECTIONS,
  type SuggestionSection,
  suggestionOptionId,
} from '@/features/chat/lib/mention-suggestions';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { MentionKindIcon } from '@/shared/messages/mention-chip';

export interface MentionSuggestionListProps {
  items: readonly MentionSuggestion[];
  selectedIndex: number;
  /** Viewport rectangle of the `@query` being typed. */
  rect: DOMRect | null;
  onSelect: (item: MentionSuggestion) => void;
}

/**
 * The popup of the `@` suggestion: a listbox of options grouped in sections, opened
 * above the caret. Focus stays in the editor; the selection is announced through
 * `aria-activedescendant`, which the composer sets on the editor.
 */
export function MentionSuggestionList({
  items,
  selectedIndex,
  rect,
  onSelect,
}: MentionSuggestionListProps) {
  const { t } = useTranslation();

  const style = rect
    ? { left: rect.left, bottom: window.innerHeight - rect.top + 4 }
    : { visibility: 'hidden' as const };

  return (
    <div
      id={SUGGESTION_LISTBOX_ID}
      role="listbox"
      aria-label={t('chat.composer.suggestions.label')}
      style={style}
      className="fixed z-50 max-h-64 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">
          {t('chat.composer.suggestions.empty')}
        </p>
      ) : (
        SUGGESTION_SECTIONS.map((section) => {
          const inSection = items.filter((item) => item.section === section);
          if (inSection.length === 0) return null;
          return (
            <Fragment key={section}>
              <SectionTitle section={section} />
              {inSection.map((item) => (
                <div
                  key={item.key}
                  id={suggestionOptionId(item.key)}
                  role="option"
                  aria-selected={items[selectedIndex]?.key === item.key}
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    // Keeps the caret in the editor.
                    event.preventDefault();
                    onSelect(item);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
                    items[selectedIndex]?.key === item.key && 'bg-accent text-accent-foreground',
                  )}
                >
                  <MentionKindIcon kind={item.mention.type} className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{item.mention.label}</span>
                  {item.hint ? (
                    <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
                  ) : null}
                </div>
              ))}
            </Fragment>
          );
        })
      )}
    </div>
  );
}

function SectionTitle({ section }: { section: SuggestionSection }) {
  const { t } = useTranslation();
  return (
    <div
      role="presentation"
      className="px-2 pt-1.5 pb-0.5 text-xs font-medium uppercase text-muted-foreground"
    >
      {t(`chat.composer.suggestions.sections.${section}`)}
    </div>
  );
}
