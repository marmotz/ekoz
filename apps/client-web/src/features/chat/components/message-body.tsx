import Markdown from 'react-markdown';

import { markdownOptions } from '@/features/chat/lib/markdown-allow-list';

/** Message text as sanitised Markdown: allow-listed elements only, no raw HTML. */
export function MessageBody({ body }: { body: string }) {
  return (
    <div className="break-words text-sm [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:whitespace-pre-wrap [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5">
      <Markdown {...markdownOptions}>{body}</Markdown>
    </div>
  );
}
