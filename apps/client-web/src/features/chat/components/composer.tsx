import type { MentionTarget } from '@ekozhq/sdk';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { useMentionSuggestions } from '@/features/chat/hooks/use-mention-suggestions';
import type { ComposerBlock } from '@/features/chat/lib/composer-state';
import { MentionNode, mentionsOfDoc } from '@/features/chat/lib/mention-node';
import { SUGGESTION_LISTBOX_ID, suggestionOptionId } from '@/features/chat/lib/mention-suggestions';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';

const BLOCK_KEYS = {
  join: 'chat.composer.disabled.join',
  read_only: 'chat.composer.disabled.readOnly',
  permission: 'chat.composer.disabled.permission',
} as const satisfies Record<ComposerBlock, string>;

/** What the composer hands over: the restricted-Markdown body and the targets it mentions. */
export interface ComposerMessage {
  body: string;
  mentions: MentionTarget[];
}

export interface ComposerProps {
  roomId: string;
  /** Whether `@all`, roles and groups can be mentioned (channels only). */
  allowCollective: boolean;
  /** Why writing is not possible, or `null`. */
  block: ComposerBlock | null;
  /** True until the history is loaded: there is nowhere to add a pending message yet. */
  loading?: boolean;
  onSend: (message: ComposerMessage) => void;
}

const editorClass =
  '[&_.ProseMirror]:min-h-10 [&_.ProseMirror]:max-h-48 [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror]:rounded-md [&_.ProseMirror]:border [&_.ProseMirror]:border-input [&_.ProseMirror]:bg-transparent [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:text-sm [&_.ProseMirror]:break-words [&_.ProseMirror]:outline-none [&_.ProseMirror:focus-visible]:border-ring [&_.ProseMirror:focus-visible]:ring-[3px] [&_.ProseMirror:focus-visible]:ring-ring/50 [&_.ProseMirror[contenteditable=false]]:cursor-not-allowed [&_.ProseMirror[contenteditable=false]]:opacity-50 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary [&_a]:underline';

/**
 * TipTap composer (web-client-composer-editor): a schema limited to the
 * restricted-Markdown subset plus the mention node. The body is `editor.getMarkdown()`.
 * Enter sends, Shift+Enter inserts a line break, IME composition is respected and a
 * blank input is never sent. The editor only exists on the client; until then a
 * disabled placeholder stands in for it (server rendering).
 */
export function Composer({
  roomId,
  allowCollective,
  block,
  loading = false,
  onSend,
}: ComposerProps) {
  const { t } = useTranslation();
  const disabled = block !== null || loading;
  const [{ empty, blank }, setContentState] = useState({ empty: true, blank: true });
  const suggestions = useMentionSuggestions({ roomId, allowCollective });

  // Read by the editor's key handler, which is created once.
  const submitRef = useRef<() => void>(() => {});
  const suggestionOpenRef = useRef(false);
  const label = t('chat.composer.label');

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        underline: false,
        link: { openOnClick: false, autolink: false },
      }),
      Markdown,
      MentionNode.configure({ suggestion: suggestions.suggestion }),
    ],
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-haspopup': 'listbox' },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return false;
        // Enter picks a suggestion while the popup is open.
        if (suggestionOpenRef.current) return false;
        event.preventDefault();
        submitRef.current();
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      setContentState({ empty: current.isEmpty, blank: current.getMarkdown().trim() === '' });
    },
  });

  useEffect(() => {
    suggestionOpenRef.current = suggestions.isOpen;
  }, [suggestions.isOpen]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Opening a room puts the caret in the composer, as soon as it can be typed in
  // (the editor is read-only until the history is loaded). Once per room, so a
  // later blur or a re-enable never steals focus.
  const focusedRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || disabled || focusedRoomRef.current === roomId) return;
    focusedRoomRef.current = roomId;
    editor.commands.focus('end');
  }, [editor, disabled, roomId]);

  // Accessible name, and the option the arrow keys are on.
  const { activeOptionKey, isOpen } = suggestions;
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    dom.setAttribute('aria-label', label);
    dom.setAttribute('aria-disabled', String(disabled));
    dom.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) dom.setAttribute('aria-controls', SUGGESTION_LISTBOX_ID);
    else dom.removeAttribute('aria-controls');
    if (activeOptionKey)
      dom.setAttribute('aria-activedescendant', suggestionOptionId(activeOptionKey));
    else dom.removeAttribute('aria-activedescendant');
  }, [editor, label, disabled, isOpen, activeOptionKey]);

  const submit = () => {
    if (!editor || disabled) return;
    const body = editor.getMarkdown().trim();
    if (body === '') return;
    const mentions = mentionsOfDoc(editor.state.doc).map(({ type, target, token }) => ({
      type,
      target,
      token,
    }));
    onSend({ body, mentions });
    editor.commands.clearContent(true);
    setContentState({ empty: true, blank: true });
  };
  useEffect(() => {
    submitRef.current = submit;
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} className="border-t p-3">
      {block ? <p className="mb-2 text-sm text-muted-foreground">{t(BLOCK_KEYS[block])}</p> : null}
      <div className="flex items-end gap-2">
        {editor ? (
          <div className="relative min-w-0 flex-1">
            <EditorContent editor={editor} className={editorClass} />
            {empty ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-2 left-3 text-sm text-muted-foreground"
              >
                {t('chat.composer.placeholder')}
              </span>
            ) : null}
          </div>
        ) : (
          <Textarea
            aria-label={label}
            placeholder={t('chat.composer.placeholder')}
            className="min-h-10 flex-1 resize-none"
            rows={1}
            disabled
          />
        )}
        <Button type="submit" disabled={disabled || blank}>
          {t('chat.composer.send')}
        </Button>
      </div>
      {suggestions.popup}
    </form>
  );
}
