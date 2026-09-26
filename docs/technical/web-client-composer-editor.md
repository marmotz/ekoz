# Web client composer editor

## Context

The web client composer is a plain `<textarea>`
([composer.tsx](../../apps/client-web/src/features/chat/components/composer.tsx)).
Two features need more than plain text:

- [mentions](../../backlog/_archives/features/web-client-mentions/overview.md): the
  composer shows a mention as the target's display name, coloured, while the
  stored body carries the canonical identifier (`@alice/chat.example`). A
  mention must behave as one atomic unit (deleted in one keystroke, never
  half-edited).
- [composer formatting](../../backlog/_archives/features/web-client-composer-formatting/overview.md):
  bold, italic, strikethrough, code, quote, lists and links without typing
  Markdown.

Later needs have already come up: emoji picker, images and animated GIFs
(drop, paste), and link, image and video previews. Previews are rendered in
the timeline, not in the composer, so they do not weigh on this choice. Text
colour is outside the
[restricted Markdown](../protocol/messages-and-interactions.md#restricted-markdown)
subset; supporting it is a protocol change, whatever the editor.

Whatever the editor, what goes on the wire is still the restricted-Markdown
`body` plus the structured `mentions` list. The editor is a client concern.

## Alternatives

| | TipTap 3 (ProseMirror) | Lexical | Textarea + overlay |
|---|---|---|---|
| Mentions | Official `Mention` extension (suggestion popup, atomic inline node) | Official typeahead plugin; the mention node is ours to write (or a community plugin) | A mirror layer colours tokens; a local map ties `@Alice Martin` to a user. Fragile when editing inside a mention or pasting |
| Markdown in and out | Official `@tiptap/markdown` (since 3.7): per-node `parseMarkdown` / `renderMarkdown` | Official `@lexical/markdown` with transformers; one custom transformer per custom node | Native (the text is the Markdown) |
| Emoji, images, file drop / paste | `@tiptap/extension-emoji`, `Image`, `FileHandler`, all MIT (open-sourced in 3.0) | To build | To build, and limited to Markdown syntax |
| Bundle and control | Heavier (ProseMirror), modular | Lighter, lower level | None |

## Decision

**TipTap 3** is the composer editor, with only the MIT open-source extensions.
No Tiptap Cloud or Pro extension.

- The document schema is restricted to what the restricted-Markdown subset can
  express (paragraph, hard break, emphasis, strong, strike, inline code, code
  block, blockquote, lists, link) plus the mention node. A construct outside
  the subset cannot be typed or pasted into the document in the first place.
- The body is `editor.getMarkdown()`, where the mention node serialises to its
  canonical token (`@alice/chat.example`, `@all`, `@moderator`, `@design`).
  Loading a message for editing parses the body back, turning the message's
  structured mention tokens into mention nodes.
- Enter sends, Shift+Enter inserts a line break, as today. Formatting then extends
  this: Enter sends in lists and code blocks too, and Shift+Enter is the new line
  everywhere (see [composer formatting](web-client-composer-formatting.md)).

## Consequences

- New client dependencies: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`
  (only the nodes and marks listed above are enabled), `@tiptap/markdown`,
  `@tiptap/extension-mention`, `@tiptap/suggestion`.
- The composer is rebuilt once by
  [web-client-mentions](../../backlog/_archives/features/web-client-mentions/technical.md).
  Composer formatting then only adds a toolbar and marks to it.
- Emoji, image and file-drop support later reuse official extensions. Adding
  image nodes also needs a protocol change (images are outside the subset
  today).
- The web client renders on the server (TanStack Start). The editor is created
  on the client only (`immediatelyRender: false`, as TipTap documents for SSR),
  and the composer shows a disabled placeholder until then.

## As built

The composer was rebuilt by [web client mentions](web-client-mentions.md) as decided
here, with these details:

- `StarterKit` keeps only the nodes and marks listed above (heading, horizontal rule
  and underline are off). Its code block and link are replaced by configured ones: the
  link does not open on click, autolinks and only accepts `http`, `https` and `mailto`.
  Enter no longer inserts a new line in a list or a code block: it sends, and
  Shift+Enter is the new line, see [composer formatting](web-client-composer-formatting.md).
- The mention node extends `@tiptap/extension-mention` with the attributes
  `{ type, target, token, label }` and serialises to its `token`; the extension's own
  Markdown syntax is switched off.
- The `@` popup is a React listbox rendered by the composer, fed by the
  `suggestion` options of the extension; no floating-UI dependency.
- Loading a message for editing parses the body with `editor.markdown.parse` and
  `injectMentionNodes` turns the message's tokens back into nodes.
- `@tiptap/core` is used through `@tiptap/react`'s re-export, so it is not a direct
  dependency.

