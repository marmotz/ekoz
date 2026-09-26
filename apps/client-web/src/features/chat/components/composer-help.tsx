import { CircleHelp } from 'lucide-react';

import {
  COMPOSER_SHORTCUT_KEYS,
  type ComposerShortcutId,
  formatShortcut,
} from '@/features/chat/lib/composer-shortcuts';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';

const SHORTCUT_ORDER: readonly ComposerShortcutId[] = [
  'bold',
  'italic',
  'strike',
  'code',
  'codeBlock',
  'blockquote',
  'bulletList',
  'orderedList',
  'link',
  'send',
  'newline',
];

/** The Markdown a user can also type, with what it gives. */
const SYNTAX = [
  { source: '**text**', key: 'bold' },
  { source: '*text*', key: 'italic' },
  { source: '~~text~~', key: 'strike' },
  { source: '`code`', key: 'code' },
  { source: '```lang', key: 'codeBlock' },
  { source: '> text', key: 'blockquote' },
  { source: '- item', key: 'bulletList' },
  { source: '1. item', key: 'orderedList' },
] as const;

/** `?` button and its dialog: the shortcuts (from the shortcut table) and the supported Markdown. */
export function ComposerHelp() {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={t('chat.composer.help.open')}
        >
          <CircleHelp aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.composer.help.title')}</DialogTitle>
          <DialogDescription>{t('chat.composer.help.description')}</DialogDescription>
        </DialogHeader>
        <section aria-labelledby="composer-help-shortcuts" className="grid gap-2">
          <h3 id="composer-help-shortcuts" className="text-sm font-medium">
            {t('chat.composer.help.shortcuts')}
          </h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {SHORTCUT_ORDER.map((id) => (
              <div key={id} className="contents">
                <dt>{t(`chat.composer.actions.${id}`)}</dt>
                <dd>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">
                    {formatShortcut(COMPOSER_SHORTCUT_KEYS[id])}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="composer-help-syntax" className="grid gap-2">
          <h3 id="composer-help-syntax" className="text-sm font-medium">
            {t('chat.composer.help.syntax')}
          </h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            {SYNTAX.map(({ source, key }) => (
              <div key={source} className="contents">
                <dt>{t(`chat.composer.actions.${key}`)}</dt>
                <dd>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{source}</code>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </DialogContent>
    </Dialog>
  );
}
