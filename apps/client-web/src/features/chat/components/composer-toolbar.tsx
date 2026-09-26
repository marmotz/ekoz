import { type Editor, useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react';
import type { ComponentProps, ComponentType } from 'react';

import { ComposerHelp } from '@/features/chat/components/composer-help';
import { LinkPopover } from '@/features/chat/components/link-popover';
import { type ComposerShortcutId, shortcutLabel } from '@/features/chat/lib/composer-shortcuts';
import { useTranslation } from '@/shared/i18n/use-translation';
import { CODE_LANGUAGES, PLAIN_TEXT_ID } from '@/shared/messages/code-languages';
import { Button } from '@/shared/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';

type ToggleId = Exclude<ComposerShortcutId, 'send' | 'newline' | 'link'>;

const TOGGLES: readonly {
  id: ToggleId;
  icon: ComponentType<{ 'aria-hidden'?: boolean }>;
  mark: string;
  run: (editor: Editor) => void;
}[] = [
  { id: 'bold', icon: Bold, mark: 'bold', run: (e) => void e.chain().focus().toggleBold().run() },
  {
    id: 'italic',
    icon: Italic,
    mark: 'italic',
    run: (e) => void e.chain().focus().toggleItalic().run(),
  },
  {
    id: 'strike',
    icon: Strikethrough,
    mark: 'strike',
    run: (e) => void e.chain().focus().toggleStrike().run(),
  },
  { id: 'code', icon: Code, mark: 'code', run: (e) => void e.chain().focus().toggleCode().run() },
  {
    id: 'codeBlock',
    icon: SquareCode,
    mark: 'codeBlock',
    run: (e) => void e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'blockquote',
    icon: Quote,
    mark: 'blockquote',
    run: (e) => void e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'bulletList',
    icon: List,
    mark: 'bulletList',
    run: (e) => void e.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    icon: ListOrdered,
    mark: 'orderedList',
    run: (e) => void e.chain().focus().toggleOrderedList().run(),
  },
];

export interface ComposerToolbarProps {
  editor: Editor;
  disabled: boolean;
  /** Below `md` the toolbar is folded behind the "Aa" button. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
}

function ToolbarButton({
  id,
  active = false,
  label,
  children,
  ...props
}: { id: ComposerShortcutId; active?: boolean; label: string } & ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="icon"
          className="size-8"
          aria-label={label}
          aria-pressed={active}
          // Keep the editor's selection: the click must not take the focus away.
          onMouseDown={(event) => event.preventDefault()}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} ({shortcutLabel(id)})
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Formatting toolbar of the composer (web-client-composer-formatting technical design
 * C6): one button per supported construct with its shortcut in a tooltip, a language
 * selector while the cursor is in a code block, and the help panel. From `md` up it is
 * always visible; below, it opens behind an "Aa" button.
 */
export function ComposerToolbar({
  editor,
  disabled,
  expanded,
  onExpandedChange,
  linkOpen,
  onLinkOpenChange,
}: ComposerToolbarProps) {
  const { t } = useTranslation();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      active: Object.fromEntries(
        TOGGLES.map(({ id, mark }) => [id, current.isActive(mark)] as const),
      ) as Record<ToggleId, boolean>,
      link: current.isActive('link'),
      inCodeBlock: current.isActive('codeBlock'),
      language: (current.getAttributes('codeBlock').language as string | null) ?? '',
    }),
  });

  return (
    <TooltipProvider delayDuration={400}>
      <div className="mb-1 flex items-center gap-1">
        <Button
          type="button"
          variant={expanded ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2 md:hidden"
          aria-label={t('chat.composer.toolbar.toggle')}
          aria-expanded={expanded}
          aria-controls="composer-toolbar"
          onClick={() => onExpandedChange(!expanded)}
        >
          Aa
        </Button>
        <div
          id="composer-toolbar"
          role="toolbar"
          aria-label={t('chat.composer.toolbar.label')}
          className={`${expanded ? 'flex' : 'hidden'} min-w-0 flex-1 flex-wrap items-center gap-1 md:flex`}
        >
          {TOGGLES.map(({ id, icon: Icon, run }) => (
            <ToolbarButton
              key={id}
              id={id}
              active={state.active[id]}
              disabled={disabled}
              label={t(`chat.composer.actions.${id}`)}
              onClick={() => run(editor)}
            >
              <Icon aria-hidden />
            </ToolbarButton>
          ))}
          <LinkPopover editor={editor} open={linkOpen} onOpenChange={onLinkOpenChange}>
            <ToolbarButton
              id="link"
              active={state.link}
              disabled={disabled}
              label={t('chat.composer.actions.link')}
            >
              <Link aria-hidden />
            </ToolbarButton>
          </LinkPopover>
          {state.inCodeBlock ? (
            <select
              aria-label={t('chat.composer.codeLanguage.label')}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={state.language}
              disabled={disabled}
              onChange={(event) =>
                void editor
                  .chain()
                  .focus()
                  .updateAttributes('codeBlock', { language: event.target.value || null })
                  .run()
              }
            >
              <option value="">{t('chat.composer.codeLanguage.auto')}</option>
              <option value={PLAIN_TEXT_ID}>{t('chat.codeBlock.plainText')}</option>
              {CODE_LANGUAGES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <ComposerHelp />
      </div>
    </TooltipProvider>
  );
}
