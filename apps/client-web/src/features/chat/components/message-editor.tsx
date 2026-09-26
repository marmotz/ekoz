import type { MentionTarget } from '@ekozhq/sdk';
import { EditorContent, type JSONContent, useEditor } from '@tiptap/react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { ComposerToolbar } from '@/features/chat/components/composer-toolbar';
import { useMentionSuggestions } from '@/features/chat/hooks/use-mention-suggestions';
import { useMessagesPolicy } from '@/features/chat/hooks/use-messages-policy';
import { buildComposerExtensions } from '@/features/chat/lib/composer-extensions';
import { createComposerHandlers } from '@/features/chat/lib/composer-handlers';
import { injectMentionNodes } from '@/features/chat/lib/mention-doc';
import { mentionsOfDoc } from '@/features/chat/lib/mention-node';
import { SUGGESTION_LISTBOX_ID, suggestionOptionId } from '@/features/chat/lib/mention-suggestions';
import { useTranslation } from '@/shared/i18n/use-translation';
import { cn } from '@/shared/lib/utils';
import { Textarea } from '@/shared/ui/textarea';

/** What the editor hands over: the restricted-Markdown body and the targets it mentions. */
export interface ComposerMessage {
  body: string;
  mentions: MentionTarget[];
}

/** What the actions next to the editor (send, save, cancel) can use. */
export interface MessageEditorApi {
  /** Something to send, within the length limit, and the editor is usable. */
  canSubmit: boolean;
  submit: () => void;
}

/** What an edit starts from: the message body and the targets it mentions. */
export interface InitialMessage {
  body: string;
  mentions: readonly MentionTarget[];
}

export interface MessageEditorProps {
  roomId: string;
  /** Whether `@all`, roles and groups can be mentioned (channels only). */
  allowCollective: boolean;
  disabled: boolean;
  /**
   * Called with the body and mentions by Enter and by `submit()`. The editor is then
   * cleared, unless it was loaded with `initial` (an edit keeps its content until the
   * save is confirmed).
   */
  onSubmit: (message: ComposerMessage) => void;
  /** Called instead of `onSubmit` when the body is what `initial` was loaded as. */
  onUnchanged?: () => void;
  /** Loads a message for editing: its body parsed back, mention chips included. */
  initial?: InitialMessage;
  /** Escape (with no `@` popup open). */
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Accessible name of the editor; defaults to the composer's. */
  label?: string;
  /** Actions rendered beside the editor. */
  children?: (api: MessageEditorApi) => ReactNode;
}

/** The counter shows from this share of the limit. */
const COUNTER_THRESHOLD = 0.8;

const editorClass =
  '[&_.ProseMirror]:min-h-10 [&_.ProseMirror]:max-h-48 [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror]:rounded-md [&_.ProseMirror]:border [&_.ProseMirror]:border-input [&_.ProseMirror]:bg-transparent [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2 [&_.ProseMirror]:text-sm [&_.ProseMirror]:break-words [&_.ProseMirror]:outline-none [&_.ProseMirror:focus-visible]:border-ring [&_.ProseMirror:focus-visible]:ring-[3px] [&_.ProseMirror:focus-visible]:ring-ring/50 [&_.ProseMirror[contenteditable=false]]:cursor-not-allowed [&_.ProseMirror[contenteditable=false]]:opacity-50 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary [&_a]:underline';

/**
 * TipTap editor of a message (web-client-composer-editor, web-client-composer-formatting):
 * a schema limited to the restricted-Markdown subset plus the mention node, a formatting
 * toolbar, the Enter rules and the length counter. The body is `editor.getMarkdown()`.
 * Shared by the send composer and, later, the edit UI. The editor only exists on the
 * client; until then a disabled placeholder stands in for it (server rendering).
 */
export function MessageEditor({
  roomId,
  allowCollective,
  disabled,
  onSubmit,
  initial,
  onUnchanged,
  onCancel,
  onDirtyChange,
  label: labelProp,
  children,
}: MessageEditorProps) {
  const { t } = useTranslation();
  const [{ empty, blank, length }, setContentState] = useState({
    empty: true,
    blank: true,
    length: 0,
  });
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const suggestions = useMentionSuggestions({ roomId, allowCollective });
  const policy = useMessagesPolicy();
  const max = policy.data?.bodyMaxLength;
  const overLimit = max !== undefined && length > max;
  const label = labelProp ?? t('chat.composer.label');
  // The Markdown the editor holds right after loading `initial`, the baseline of "unchanged".
  const baseline = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const bridge = useMemo(() => createComposerHandlers(), []);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: buildComposerExtensions({
      suggestion: suggestions.suggestion,
      handlers: bridge.handlers,
    }),
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-haspopup': 'listbox' },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown().trim();
      setContentState({ empty: current.isEmpty, blank: markdown === '', length: markdown.length });
      setDirty(baseline.current === null || markdown !== baseline.current);
    },
  });

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Load the message being edited once, as soon as the editor exists. The chips are
  // named from the members and groups already loaded, else from their tokens.
  const loadedRef = useRef(false);
  const initialRef = useRef(initial);
  const labelFor = suggestions.labelFor;
  useEffect(() => {
    const start = initialRef.current;
    if (!editor || !start || loadedRef.current) return;
    loadedRef.current = true;
    const parsed = editor.markdown?.parse(start.body);
    if (!parsed) return;
    editor.commands.setContent(
      injectMentionNodes(parsed as JSONContent, start.mentions, labelFor),
      {
        emitUpdate: false,
      },
    );
    const markdown = editor.getMarkdown().trim();
    baseline.current = markdown;
    setContentState({ empty: editor.isEmpty, blank: markdown === '', length: markdown.length });
    setDirty(false);
    editor.commands.focus('end');
  }, [editor, labelFor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Opening a room puts the caret in the editor, as soon as it can be typed in
  // (it is read-only until the history is loaded). Once per room, so a later blur
  // or a re-enable never steals focus.
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
    if (!editor || disabled || overLimit) return;
    const body = editor.getMarkdown().trim();
    if (body === '') return;
    if (initial && !dirty) {
      onUnchanged?.();
      return;
    }
    const mentions = mentionsOfDoc(editor.state.doc).map(({ type, target, token }) => ({
      type,
      target,
      token,
    }));
    onSubmit({ body, mentions });
    if (initial) return;
    editor.commands.clearContent(true);
    setContentState({ empty: true, blank: true, length: 0 });
  };

  // The key handlers are created once with the editor: they call what is current.
  useEffect(() => {
    bridge.update({
      send: submit,
      isSuggestionOpen: () => isOpen,
      openLink: () => {
        setToolbarExpanded(true);
        setLinkOpen(true);
      },
      cancel: () => {
        if (!onCancel || isOpen) return false;
        onCancel();
        return true;
      },
    });
  });

  const showCounter = max !== undefined && length >= max * COUNTER_THRESHOLD;

  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        {editor ? (
          <ComposerToolbar
            editor={editor}
            disabled={disabled}
            expanded={toolbarExpanded}
            onExpandedChange={setToolbarExpanded}
            linkOpen={linkOpen}
            onLinkOpenChange={setLinkOpen}
          />
        ) : null}
        {editor ? (
          <div className="relative">
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
            className="min-h-10 resize-none"
            rows={1}
            disabled
          />
        )}
        {showCounter ? (
          <p
            role="status"
            aria-label={t('chat.composer.counter.label')}
            className={cn(
              'mt-1 text-right text-xs',
              overLimit ? 'font-medium text-destructive' : 'text-muted-foreground',
            )}
          >
            {t('chat.composer.counter.value', { used: length, max })}
            {overLimit ? ` - ${t('chat.composer.counter.over')}` : null}
          </p>
        ) : null}
      </div>
      {children?.({ canSubmit: !disabled && !blank && !overLimit, submit })}
      {suggestions.popup}
    </div>
  );
}
