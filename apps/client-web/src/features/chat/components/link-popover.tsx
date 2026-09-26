import type { Editor } from '@tiptap/react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';

import { normaliseLinkUrl } from '@/features/chat/lib/composer-link';
import { readLinkTarget } from '@/features/chat/lib/link-target';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const { t } = useTranslation();
  const [target] = useState(() => readLinkTarget(editor));
  const [text, setText] = useState(target.text);
  const [url, setUrl] = useState(target.href);
  const [invalid, setInvalid] = useState(false);

  const apply = () => {
    const href = normaliseLinkUrl(url);
    if (!href) {
      setInvalid(true);
      return;
    }
    const label = text === '' ? href : text;
    const { from, to } = target;
    const chain = editor.chain().focus();
    if (label === target.text && from !== to) {
      // Same text: keep the marks it already carries.
      chain.setTextSelection({ from, to }).setLink({ href }).run();
    } else {
      chain
        .insertContentAt(
          { from, to },
          { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] },
        )
        .run();
    }
    onDone();
  };

  const remove = () => {
    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).unsetLink().run();
    onDone();
  };

  // Not a `<form>`: the composer around is one, and Enter must not send the message.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    apply();
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="composer-link-text">{t('chat.composer.link.text')}</Label>
        <Input
          id="composer-link-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="composer-link-url">{t('chat.composer.link.url')}</Label>
        <Input
          id="composer-link-url"
          value={url}
          placeholder="https://"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'composer-link-error' : undefined}
          autoFocus
          onChange={(event) => {
            setUrl(event.target.value);
            setInvalid(false);
          }}
          onKeyDown={onKeyDown}
        />
        {invalid ? (
          <p id="composer-link-error" role="alert" className="text-sm text-destructive">
            {t('chat.composer.link.invalid')}
          </p>
        ) : null}
      </div>
      <div className="flex justify-between gap-2">
        {target.editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={remove}>
            {t('chat.composer.link.remove')}
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" onClick={apply}>
          {t('chat.composer.link.apply')}
        </Button>
      </div>
    </div>
  );
}

export interface LinkPopoverProps {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The toolbar button that opens it. */
  children: ReactNode;
}

/** Text and URL of a link, opened by the toolbar button or `Mod+K`. */
export function LinkPopover({ editor, open, onOpenChange, children }: LinkPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        <LinkForm editor={editor} onDone={() => onOpenChange(false)} />
      </PopoverContent>
    </Popover>
  );
}
