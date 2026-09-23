import { type FormEvent, type KeyboardEvent, useState } from 'react';

import type { ComposerBlock } from '@/features/chat/lib/composer-state';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';

const BLOCK_KEYS = {
  join: 'chat.composer.disabled.join',
  read_only: 'chat.composer.disabled.readOnly',
  permission: 'chat.composer.disabled.permission',
} as const satisfies Record<ComposerBlock, string>;

export interface ComposerProps {
  /** Why writing is not possible, or `null`. */
  block: ComposerBlock | null;
  /** True until the history is loaded: there is nowhere to add a pending message yet. */
  loading?: boolean;
  onSend: (body: string) => void;
}

/** Enter sends, Shift+Enter inserts a newline, blank input is never sent. */
export function Composer({ block, loading = false, onSend }: ComposerProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const disabled = block !== null || loading;

  const submit = () => {
    const body = value.trim();
    if (disabled || body === '') return;
    onSend(body);
    setValue('');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} className="border-t p-3">
      {block ? <p className="mb-2 text-sm text-muted-foreground">{t(BLOCK_KEYS[block])}</p> : null}
      <div className="flex items-end gap-2">
        <Textarea
          aria-label={t('chat.composer.label')}
          placeholder={t('chat.composer.placeholder')}
          className="min-h-10 flex-1 resize-none"
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button type="submit" disabled={disabled || value.trim() === ''}>
          {t('chat.composer.send')}
        </Button>
      </div>
    </form>
  );
}
