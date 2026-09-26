# Web client composer formatting

## Context

The composer ([web client composer editor](web-client-composer-editor.md)) is a
TipTap 3 editor whose schema is limited to the
[restricted Markdown](../protocol/messages-and-interactions.md#restricted-markdown)
subset. This page records how it lets a user format a message without knowing
Markdown, how code blocks are written and rendered, and how the client learns the
body length limit. Product decisions are in the
[feature overview](../../backlog/features/web-client-composer-formatting/overview.md),
the code-level design in its
[technical design](../../backlog/features/web-client-composer-formatting/technical.md).

Three facts frame the choices:

- The server accepts a fixed set of Markdown node types and rejects anything else
  with `message.body_invalid`. The composer must therefore be unable to produce a
  heading, a rule, an image or a table, including through Markdown input rules
  (`# `, `---`) and paste.
- Enter already sends. A list item or a code line cannot also use Enter for a new
  line.
- The server checks `messages.body_max_length` (runtime, hot-reloadable) on
  `body.length` before parsing, and nothing exposed that limit to a client.

## Decisions

### Toolbar and shortcuts

- One toolbar, visible from `md` up, folded behind an "Aa" button below (touch
  screens have no shortcuts and little room).
  Buttons: bold, italic, strikethrough, inline code, code block, quote, bulleted
  list, numbered list, link. Active state comes from `useEditorState`.
- Every button has an `aria-label` and a Radix tooltip carrying its shortcut,
  instead of a `title` attribute (not touch friendly, not announced reliably).
  This adds `@radix-ui/react-tooltip`; the popover primitive already existed.
- One table, `lib/composer-shortcuts.ts`, holds the shortcuts. The tooltips, the
  help panel and the keymap extension all read it, so they cannot drift. The keys
  are TipTap's defaults (verified against the installed 3.31 extensions); none is
  reserved by a browser, so `preventDefault` wins over browser bindings such as
  `Mod-k` or `Mod-e`. `Mod-k` (link) is ours.
- A help panel (`?` button, shared `Dialog`) lists the shortcuts from the table and
  the Markdown syntax that is converted as it is typed.
- Markdown input rules stay on for the kept nodes. A conversion is reverted with
  Backspace right after it (TipTap's undo-input-rule) or with undo. Block rules
  (`- `, `> `, a code fence) go back to an empty paragraph; a mark rule goes back to
  the literal text.

### Enter and Shift+Enter

| Key | Paragraph | List item | Code block |
|-----|-----------|-----------|------------|
| `Enter` | sends | sends | sends |
| `Shift+Enter` | hard break | new item (lifts out on an empty item) | newline; three in a row at the end exit the block |

Alternatives considered:

| Option | Why not |
|--------|---------|
| Enter inserts a new item / line in lists and code, and sends elsewhere | Two meanings for one key depending on where the caret is; sending a message written in a list would need a shortcut. |
| Enter sends only when the text has no block structure | Same ambiguity, and it hides the send behaviour from the user. |
| Mod+Enter sends | Slower for the common case, and not what a chat user expects. |

The rules live in a ProseMirror plugin (`lib/send-on-enter.ts`) above the nodes' own
`Enter` bindings, otherwise the list and code bindings would run first. While the
`@` popup is open the plugin steps aside so Enter still picks a suggestion, and it
ignores Enter while an IME is composing. `exitOnTripleEnter` is off on the code
block: that exit is bound to Enter, which sends.

### Paste and links

- The schema decides what survives a paste. Emphasis, strong, strikethrough, code,
  links, lists, quotes and code blocks are kept; headings, tables, images, colours
  and underline reduce to text because no node or mark exists for them.
- A plain text paste is not parsed as Markdown: the paste rules of bold, italic,
  strike and code are removed, so `**text**` pasted stays literal. Only typing it
  converts it.
- Links reuse the renderer's scheme rule (`transformUrl`): `http`, `https` and
  `mailto`. A bare URL is linkified when typed or pasted, and pasting a URL over a
  selection links the selection. The link popover (text and URL, opened by the
  button or `Mod-k`) refuses another scheme or an unparsable URL with an inline
  message and stays open. Enter in its fields applies the link and is stopped there, so
  it never reaches the send handling of the composer.

### Code blocks

- The composer keeps a plain monospace block; highlighting happens in the timeline
  only, so `@tiptap/extension-code-block-lowlight` is not needed.
- A block carries a language from one table (`shared/messages/code-languages.ts`)
  shared by the composer selector and the renderer: about twenty languages, each
  with its label, aliases and `highlight.js` grammar. The `language` attribute is
  normalised (alias to id, known id kept, anything else to `text`), on the fence
  input rule, on paste and when a body is loaded. "Auto-detect" writes a bare fence
  and stays distinguishable from "plain text" (`text`).
- The info string is preserved by the server and not validated (see the protocol),
  so another client may send any value; the renderer treats an unknown one as
  unhighlighted text.

Highlighting alternatives:

| Option | Why not |
|--------|---------|
| Shiki | Better themes, but its highlighter is created asynchronously and the bundle is heavier; messages render synchronously, on the server too. |
| `rehype-highlight` (highlight.js) | **Chosen.** Synchronous, restricted to the table with `subset` (which also caps the bundle), detects a fence without language, and fits `react-markdown`'s rehype pipeline. |

The renderer adds `span` to its element allow-list because the highlighter emits
`<span class="hljs-*">`. There is still no raw-HTML path, so a `<span>` in a body
stays inert. A `CodeBlock` component replaces `pre`: language label (declared or
detected, mapped through the table), copy button (`navigator.clipboard`, hidden
where the API is missing) and the highlight theme, which maps `.hljs-*` to design
tokens in light and dark.

### Message length

The limit is a runtime setting, so the client needs to read it.

| Option | Why not |
|--------|---------|
| Field in the discovery document | Cached five minutes, and it mixes a runtime setting into a federation document (the reason `GET /auth/policy` is its own endpoint). |
| Field on `GET /rooms/:id` | Repeats one server-wide value on every room and needs a room round trip. |
| Client constant | Wrong as soon as an operator changes the setting. |
| Public `GET /messages/policy` | **Chosen.** Small, uncached, read live from the configuration, extensible with more limits. |

The client reads it with `sdk.messages.policy()` (TanStack Query, `staleTime` 60 s),
and refetches it when a send fails with `message.body_too_long`. The editor
measures `getMarkdown().trim().length`, which is what the server counts, mention
tokens included. From 80 % of the limit it shows `used / max`; beyond the limit the
counter turns to the error tone and both the send button and Enter are disabled.
While the policy is loading or failed there is no counter and no block: the server
`422` stays the safety net.

## Consequences

- New client dependencies: `rehype-highlight`, `highlight.js`,
  `@radix-ui/react-tooltip`, `@tiptap/extension-link` and
  `@tiptap/extension-code-block` (both were bundled by the starter kit and are now
  configured explicitly). `remark` joins the dev dependencies to check that a
  serialised body passes the server subset.
- One more public route (`GET /messages/policy`) to keep in step with the setting it
  mirrors; the e2e suite covers the value following a configuration change.
- The highlight grammars add to the client bundle. The table is one file to trim.
- Enter never inserts a new line in a list or a code block: existing users of that
  behaviour use Shift+Enter, and the help panel lists it.
- `MessageEditor` holds the editor, toolbar, link popover and counter, and `Composer`
  wraps it with the send button. The edit UI of message actions reuses
  `MessageEditor` with its own actions.
