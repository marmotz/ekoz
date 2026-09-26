import type { MentionTarget } from '@ekozhq/sdk';
import { type ComponentProps, type ReactNode, useMemo } from 'react';
import Markdown from 'react-markdown';

import { cn } from '@/shared/lib/utils';
import { markdownOptions } from '@/shared/messages/markdown-allow-list';
import { MentionChip } from '@/shared/messages/mention-chip';
import { remarkMentions } from '@/shared/messages/remark-mentions';

export interface MessageBodyProps {
  body: string;
  /** The room the message belongs to: chips resolve members and groups in it. */
  roomId: string;
  mentions?: readonly MentionTarget[];
  /** A quote-sized rendering: links flattened to text, clamped to two lines. */
  compact?: boolean;
  /** With `compact`: one line, cut with an ellipsis, instead of two. */
  singleLine?: boolean;
}

const NO_MENTIONS: readonly MentionTarget[] = [];

/** A link or code block shown as its text: a quote is not something to click through or copy from. */
function FlatText({ children }: { children?: ReactNode }) {
  return <span>{children}</span>;
}

/** Message text as sanitised Markdown: allow-listed elements only, no raw HTML. */
export function MessageBody({
  body,
  roomId,
  mentions = NO_MENTIONS,
  compact = false,
  singleLine = false,
}: MessageBodyProps) {
  const options = useMemo(() => {
    // `react-markdown` hands the hast properties over as props of the element.
    const Mention = (props: ComponentProps<'span'> & Record<string, unknown>) => {
      const target = mentions[Number(props['data-mention-index'])];
      return target ? (
        <MentionChip roomId={roomId} target={target} />
      ) : (
        <span>{props.children}</span>
      );
    };
    return {
      ...markdownOptions,
      remarkPlugins: [
        ...(markdownOptions.remarkPlugins ?? []),
        [remarkMentions, { mentions }] as [typeof remarkMentions, { mentions: typeof mentions }],
      ],
      components: {
        ...markdownOptions.components,
        ...(compact ? { a: FlatText, pre: FlatText } : {}),
        mention: Mention,
      },
    };
  }, [mentions, roomId, compact]);

  return (
    <div
      className={cn(
        'break-words text-sm [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:whitespace-pre-wrap [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5',
        compact && (singleLine ? 'truncate [&_p]:inline' : 'line-clamp-2 [&_p]:inline'),
      )}
    >
      <Markdown {...options}>{body}</Markdown>
    </div>
  );
}
