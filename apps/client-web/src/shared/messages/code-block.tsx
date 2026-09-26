import { Check, Copy } from 'lucide-react';
import {
  Children,
  type ComponentProps,
  isValidElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { useTranslation } from '@/shared/i18n/use-translation';
import { findLanguage, PLAIN_TEXT_NAMES } from '@/shared/messages/code-languages';
import { Button } from '@/shared/ui/button';

const COPIED_MS = 2000;

/** The `language-*` name on the `<code>` a fence produced (declared or detected). */
function languageOfCode(children: ReactNode): string | null {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ className?: string }>(child)) continue;
    const match = /(?:^|\s)language-(\S+)/.exec(child.props.className ?? '');
    if (match) return match[1] ?? null;
  }
  return null;
}

const subscribeNothing = () => () => {};
const clipboardAvailable = () => Boolean(navigator.clipboard?.writeText);

/** Copy button: absent where the async clipboard API is (server rendering, insecure origins). */
function CopyButton({ getText }: { getText: () => string }) {
  const { t } = useTranslation();
  const available = useSyncExternalStore(subscribeNothing, clipboardAvailable, () => false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!available) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
    } catch {
      // Denied by the browser: nothing was copied, so no feedback.
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 gap-1 px-2 text-xs"
      onClick={copy}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite">
        {copied ? t('chat.codeBlock.copied') : t('chat.codeBlock.copy')}
      </span>
    </Button>
  );
}

/**
 * A fenced code block of a message: language label, copy button and the
 * highlighted code (web-client-composer-formatting technical design C5).
 */
export function CodeBlock({
  node,
  children,
  ...props
}: ComponentProps<'pre'> & { node?: unknown }) {
  // `node` is the hast element react-markdown passes along; it must not reach the DOM.
  void node;
  const { t } = useTranslation();
  const preRef = useRef<HTMLPreElement>(null);
  const language = languageOfCode(children);
  const label = language
    ? (findLanguage(language)?.label ??
      ((PLAIN_TEXT_NAMES as readonly string[]).includes(language)
        ? t('chat.codeBlock.plainText')
        : null))
    : null;

  return (
    <div className="my-1 overflow-hidden rounded border bg-muted" data-testid="code-block">
      <div className="flex items-center justify-between border-b px-2 py-0.5 text-xs text-muted-foreground">
        <span>{label}</span>
        <CopyButton getText={() => preRef.current?.textContent ?? ''} />
      </div>
      <pre ref={preRef} className="overflow-x-auto p-2" {...props}>
        {children}
      </pre>
    </div>
  );
}
