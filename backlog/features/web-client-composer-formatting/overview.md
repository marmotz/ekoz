# Web client composer formatting

**Status**: designed, see [technical.md](./technical.md)

## Context

Message bodies are a restricted Markdown subset: emphasis, strong,
strikethrough, inline code, fenced code, blockquote, lists, `http(s)`/`mailto`
links, line breaks; no raw HTML, images, headings or tables, see
[messages and interactions](../../../docs/protocol/messages-and-interactions.md#restricted-markdown).
The client already renders that subset
([`web-client-chat`](../../_archives/features/web-client-chat/overview.md)), but the composer is a
plain textarea: formatting requires knowing the Markdown syntax, and the server
rejects anything outside the allow-list.

## Goal

A user can format a message without knowing Markdown (bold, italic,
strikethrough, code, quote, lists, links), see what it will look like, and is
not surprised by a server rejection for a construct outside the subset.

## Decisions made

### Editing model

- WYSIWYG composer: the text is shown formatted as it is typed; the body sent
  is still restricted Markdown (editor settled in
  [web client composer editor](../../../docs/technical/web-client-composer-editor.md)).
- Only constructs of the restricted subset can exist in the composer, so a
  formatted message is never rejected for its content.

### Toolbar and shortcuts

- A formatting toolbar is always visible on desktop: bold, italic,
  strikethrough, inline code, code block, quote, bulleted list, numbered list,
  link.
- On a narrow screen the toolbar is collapsed by default behind an "Aa" button.
- Keyboard shortcuts for every action (Ctrl/Cmd+B, I, K, ...), shown in each
  button's tooltip, plus a help panel listing the shortcuts and the Markdown
  syntax.
- Markdown syntax typed in the composer (`**bold**`, `` `code` ``, `> `, `- `,
  `1. `, ```` ``` ````) is converted on the fly; undo reverts the conversion.

### Enter key

- Enter always sends, including inside a list or a code block.
- Shift+Enter inserts a new line, a new list item or a new code line.

### Links

- The link button (or Ctrl/Cmd+K) opens a popover with text and URL,
  prefilled with the selection; it also edits an existing link.
- Pasting a URL over selected text links it; a typed bare URL is linkified.
- Only `http(s)` and `mailto` are accepted; any other scheme is refused in the
  popover with an explicit message.

### Paste

- Pasting rich content keeps what the subset supports (emphasis, strong,
  strikethrough, code, links, lists, quotes); everything else (headings,
  tables, images, colours) is reduced to plain text.
- Ctrl/Cmd+Shift+V pastes as plain text.

### Code blocks

- A code block can carry a language: a selector on the block offers a fixed
  list of common languages plus "plain text". A language typed or pasted
  outside the list is treated as plain text.
- The timeline highlights code blocks. Without a declared language, the
  language is auto-detected at render time.
- Rendered code blocks show a language label and a copy button.

### Length

- A counter appears as the message nears the server's maximum body length,
  computed on the Markdown actually sent; sending is disabled beyond it.

### Message editing

- Editing an existing message uses the same composer, with the same toolbar,
  shortcuts and conversions.

## Dependencies

- [`web-client-message-actions`](../web-client-message-actions/overview.md):
  message editing reuses this formatting composer.
- [`web-client-chat`](../../_archives/features/web-client-chat/overview.md): composer and renderer.
- [`web-client-mentions`](../web-client-mentions/overview.md) also extends the composer.
- Builds on the TipTap 3 composer introduced by
  [`web-client-mentions`](../web-client-mentions/technical.md), see
  [web client composer editor](../../../docs/technical/web-client-composer-editor.md).
