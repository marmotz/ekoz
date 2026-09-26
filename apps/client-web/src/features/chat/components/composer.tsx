import { type ComposerMessage, MessageEditor } from '@/features/chat/components/message-editor';
import type { ComposerBlock } from '@/features/chat/lib/composer-state';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';

export type { ComposerMessage };

const BLOCK_KEYS = {
  join: 'chat.composer.disabled.join',
  read_only: 'chat.composer.disabled.readOnly',
  permission: 'chat.composer.disabled.permission',
} as const satisfies Record<ComposerBlock, string>;

export interface ComposerProps {
  roomId: string;
  /** Whether `@all`, roles and groups can be mentioned (channels only). */
  allowCollective: boolean;
  /** Why writing is not possible, or `null`. */
  block: ComposerBlock | null;
  /** True until the history is loaded: there is nowhere to add a pending message yet. */
  loading?: boolean;
  onSend: (message: ComposerMessage) => void;
  /** Called when the user changes the draft while it has content. */
  onTyping?: () => void;
}

/**
 * The composer of a room: the message editor (toolbar, Enter rules, length counter)
 * and its send button, or why writing is not possible.
 */
export function Composer({
  roomId,
  allowCollective,
  block,
  loading = false,
  onSend,
  onTyping,
}: ComposerProps) {
  const { t } = useTranslation();

  return (
    <div className="border-t p-3">
      {block ? <p className="mb-2 text-sm text-muted-foreground">{t(BLOCK_KEYS[block])}</p> : null}
      <MessageEditor
        roomId={roomId}
        allowCollective={allowCollective}
        disabled={block !== null || loading}
        onSubmit={onSend}
        onTyping={onTyping}
      >
        {({ canSubmit, submit }) => (
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            {t('chat.composer.send')}
          </Button>
        )}
      </MessageEditor>
    </div>
  );
}
