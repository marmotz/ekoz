# Web client composer formatting: technical design

This page covers:
- the formatting layer of the `apps/client-web` composer (toolbar, shortcuts,
  Enter rules, links, paste, code blocks, length counter);
- the rendering of code blocks in the timeline (highlighting, label, copy);
- a small public messages policy endpoint in `apps/server`, and its SDK binding.

Product decisions are in [overview.md](./overview.md). This page grounds them
in the code.

Related:
- [web client composer editor](../../../../docs/technical/web-client-composer-editor.md)
  (TipTap 3, restricted schema, Markdown in and out);
- [web-client-mentions technical design](../web-client-mentions/technical.md)
  (§C1 builds the TipTap composer this page extends, §C2 moves the renderer to
  `shared/messages`);
- [messages and interactions protocol](../../../../docs/protocol/messages-and-interactions.md);
- [auth policy endpoint](../../../../docs/technical/auth-policy-endpoint.md)
  (the pattern reused for the messages policy);
- [web client chat](../../../../docs/technical/web-client-chat.md);
- [OpenAPI description and SDK types](../../../../docs/technical/openapi-description-and-sdk-types.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | The composer is still a `<textarea>` with a hand-written Enter rule. The TipTap composer is built by [web-client-mentions](../web-client-mentions/technical.md) (#177), which this feature extends. | [composer.tsx](../../../../apps/client-web/src/features/chat/components/composer.tsx) | This design only adds to the composer of #177. It depends on #177 and never touches the textarea. |
| F2 | The server accepts these mdast nodes only: `root`, `paragraph`, `text`, `emphasis`, `strong`, `delete`, `inlineCode`, `code`, `blockquote`, `list`, `listItem`, `link`, `break`. Any other node (heading, thematic break, table, image, html) is `message.body_invalid`. | [restricted-markdown.ts:17](../../../../apps/server/src/modules/conversations/messages/restricted-markdown.ts) | The TipTap schema must not be able to produce any other node, including through Markdown input rules (`# `, `---`). The fenced-code `lang` is not checked, so a language after the fence is accepted and stored verbatim. |
| F3 | The server checks `body.length` (UTF-16 code units) against `messages.body_max_length` (runtime, hot-reloadable, default 16 000) before parsing. | [messages.service.ts:376](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [registry.ts:399](../../../../apps/server/src/core/config/registry.ts) | The client counter uses JS `string.length` on the exact body sent, so both sides agree. |
| F4 | No endpoint exposes that limit: [web-client-chat](../../../../docs/technical/web-client-chat.md) states the client "does not know `messages.body_max_length`" and shows the server `422`. | web-client-chat.md:141 | A public policy endpoint is added (S1); that sentence of the doc is updated. |
| F5 | The renderer allow-lists elements (`ALLOWED_ELEMENTS`) with `unwrapDisallowed: true`, and applies `skipHtml`. It has no `rehypePlugins`, no `pre` component, no `span`. | [markdown-allow-list.ts:12](../../../../apps/client-web/src/features/chat/lib/markdown-allow-list.ts), [message-body.tsx](../../../../apps/client-web/src/features/chat/components/message-body.tsx) | `rehype-highlight` emits `<span class="hljs-*">`. Without `span` in the allow-list, the wrapper is unwrapped and the highlighting is lost: `span` is added (no raw-HTML path exists, so it stays safe). |
| F6 | `StarterKit` 3.31.3 bundles heading, horizontal rule, underline, link and list-keymap besides the wanted nodes. | `npm view @tiptap/starter-kit@3.31.3 dependencies` | Heading, horizontal rule and underline are disabled explicitly (F2); link is configured explicitly (C3). |
| F7 | `transformUrl` already restricts links to `http:`, `https:`, `mailto:`. `@tiptap/extension-link` accepts `isAllowedUri`, `autolink`, `linkOnPaste`, `defaultProtocol`. | [markdown-allow-list.ts:25](../../../../apps/client-web/src/features/chat/lib/markdown-allow-list.ts), Tiptap Link docs | One scheme rule shared by the composer and the renderer (C3). |
| F8 | The SDK `messages` resource is session-based (`session.request`) and declares body types by hand. The generated API types come from the server OpenAPI description. | [messages.ts](../../../../packages/sdk/src/resources/messages.ts), [auth-policy.controller.ts](../../../../apps/server/src/modules/identity/auth/auth-policy.controller.ts) | The new endpoint follows `GET /auth/policy` end to end: controller + Zod DTO, OpenAPI regeneration, SDK method, `changeset`. |
| F9 | `shared/ui` has no tooltip nor popover. `@radix-ui/react-dialog` and `react-dropdown-menu` are already used. | [shared/ui](../../../../apps/client-web/src/shared/ui) | Two Radix primitives are added (tooltip, popover) instead of `title` attributes, which are neither touch-friendly nor accessible enough. |

## 2. Model

The composer document stays the one of the
[composer editor decision](../../../../docs/technical/web-client-composer-editor.md):
what goes on the wire is `editor.getMarkdown()`. Formatting adds no data, only
ways to produce the same restricted Markdown. The body sent is trimmed, as
today.

## 3. Server (`apps/server`, `conversations` module)

### S1. `GET /messages/policy`

A public endpoint next to the messages controller, on the pattern of
`GET /auth/policy`:

```json
{ "bodyMaxLength": 16000 }
```

- `MessagesPolicyController` (`messages/messages-policy.controller.ts`),
  `@Public()`, `Cache-Control: no-store`, and a Zod DTO
  (`messages-policy.dto.ts`) with `@ApiOperation` / `@ApiOkResponse`.
- The value is read from `ConfigService` (`messages.body_max_length`) on every
  call, so a hot reload is visible on the next request.
- Nothing secret: the limit is observable by sending a long message.
- The response is an object, not a bare number, so later limits can be added
  additively (attachments in [`content-and-sharing`](../content-and-sharing/overview.md)).
- Protocol: a "Policy" section in
  [messages-and-interactions.md](../../../../docs/protocol/messages-and-interactions.md)
  and an entry in the protocol `CHANGELOG.md`. Also state there that the info
  string of a fenced code block is preserved (not validated).

Alternatives considered:

| Option | Why not |
|--------|---------|
| Field in the discovery document | Cached 5 minutes and mixes runtime settings into a federation document; same reason as for the auth policy. |
| Field on `GET /rooms/:id` | Repeats one global value on every room and needs a room round trip for a server-wide setting. |
| Client constant | Wrong as soon as an operator changes the setting. |

## 4. SDK (`packages/sdk`)

- `MessagesResource.policy(): Promise<MessagesPolicy>` calling
  `GET /messages/policy`.
- `MessagesPolicy` is the generated type, re-exported like `AuthPolicy`
  (`types/wire.ts`, `types/schemas.ts`), with a schema test.
- A changeset (`packages/sdk/src` changes).

## 5. Client (`apps/client-web`)

### C1. Editor extensions (`features/chat/lib/composer-extensions.ts`)

One function builds the extension list, shared by the send composer and the
edit composer (C7):

- `StarterKit.configure`:
  - `heading: false`, `horizontalRule: false`, `underline: false` (F2, F6);
  - `codeBlock: false`, replaced by our `CodeBlock` (C4);
  - `link: false`, replaced by our configured `Link` (C3);
  - keep bold, italic, strike, code, blockquote, bullet and ordered lists,
    hard break, list keymap, undo / redo.
- `Markdown` (`@tiptap/markdown`), `Mention` (from #177), `Link`, `CodeBlock`,
  `SendOnEnter` (C2).
- No image, no table, no colour: they cannot be created, pasted or serialised.
- Markdown **input rules** stay enabled for the kept nodes (`**x**`, `*x*`,
  `~~x~~`, `` `x` ``, `> `, `- `, `1. `, ```` ``` ````). Heading and rule
  rules vanish with their nodes, so `# ` and `---` stay literal text.
  Reverting a conversion uses TipTap's undo-input-rule behaviour (Backspace
  right after it) and undo; a test pins both.

### C2. Enter rules (`lib/send-on-enter.ts`)

An extension binding keys, with a **lower priority than the mention
suggestion** so an open `@` popup still consumes Enter to pick an item (a test
pins the order):

| Key | Behaviour |
|-----|-----------|
| `Enter` | Sends, everywhere (paragraph, list, code block). Ignored while IME composing (`isComposing`) and when the body is blank. |
| `Shift+Enter` in a paragraph | Hard break (TipTap default). |
| `Shift+Enter` in a list item | Splits the item; on an empty item it lifts out of the list. |
| `Shift+Enter` in a code block | Inserts a newline. Three in a row at the end exits the block. `exitOnTripleEnter` is set to `false` on `CodeBlock`, because it is bound to `Enter`. |

`ArrowDown` at the end still exits a code block (the extension default).

### C3. Links (`lib/composer-link.ts`, `components/link-popover.tsx`)

- `Link.configure`:
  - `openOnClick: false`, `autolink: true`, `linkOnPaste: true` (paste a URL
    over a selection links it), `defaultProtocol: 'https'`;
  - `isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && transformUrl(url) !== null`,
    reusing the renderer's scheme rule so composer and timeline cannot drift.
    `transformUrl` lives in `shared/messages` after
    [web-client-mentions C2](../web-client-mentions/technical.md).
- `LinkPopover` (Radix popover, opened by the toolbar button or `Mod+K`):
  - fields text and URL, prefilled from the selection, or from the link under
    the cursor (its whole range) for an edit;
  - with an empty selection, submitting inserts the text carrying the link;
  - "Remove link" button when editing an existing link;
  - a URL with another scheme, or unparsable, shows an inline i18n error and
    the popover stays open (overview: explicit refusal).

### C4. Code blocks (`lib/code-block.ts`, `shared/messages/code-languages.ts`)

- **Language table** (`shared/messages/code-languages.ts`), used by the
  composer selector and the renderer: `{ id, label, aliases, grammar }`, with
  `grammar` a `highlight.js` language function imported by name from
  `highlight.js/lib/languages/*`. Starting set (about 20): `bash`, `c`, `cpp`,
  `csharp`, `css`, `diff`, `go`, `xml` (HTML), `java`, `javascript`, `json`,
  `kotlin`, `markdown`, `php`, `python`, `ruby`, `rust`, `sql`, `swift`,
  `typescript`, `yaml`. The set is one file to edit.
- **Composer.** `CodeBlock` extended so `language` is normalised: an alias
  (`js`, `ts`, `py`, `sh`, `yml`, `html`) becomes its canonical id, a known id
  is kept, anything else becomes `text`. It applies to the `` ```lang `` input
  rule, to paste and to loading a body.
- **Selector.** A small dropdown on the active code block (a node view or a
  toolbar control shown while the cursor is in a block). Entries: "Auto-detect"
  (default, no language written), "Plain text" (`text`), then the table. The
  composer block itself is plain monospace, not highlighted: highlighting the
  editor would add `@tiptap/extension-code-block-lowlight` for no product gain
  (the overview asks for highlighting in the timeline).
- **Markdown.** Auto-detect serialises as a bare fence, a language as
  `` ```ts ``, plain text as `` ```text ``.

Note on the overview: "a language outside the list is treated as plain text"
is implemented as `text`, so it stays distinguishable from "no language",
which the timeline auto-detects.

### C5. Rendering (`shared/messages`)

- **Highlighter.** `rehype-highlight` (built on `lowlight` / `highlight.js`,
  added with `highlight.js` as direct dependencies):

  ```ts
  rehypePlugins: [[rehypeHighlight, {
    detect: true,
    languages: grammarsFromTable,
    subset: idsFromTable,
    plainText: ['text', 'txt', 'plaintext'],
  }]]
  ```

  - `detect: true` highlights a fence without language, restricted to the same
    table (`subset`), which also caps the bundle;
  - `plainText` blocks, and any declared language outside the table (from
    another client), are left unhighlighted;
  - a test asserts the classes produced for declared, detected, plain and
    unknown languages, since the plugin's exact class output is the contract
    the label relies on.
- **Allow-list.** `span` added to `ALLOWED_ELEMENTS` (F5). A test keeps a raw
  `<span>` in a body inert (`skipHtml`).
- **`CodeBlock` component** as `components.pre`:
  - header with the language label, taken from the `language-*` class of the
    inner `code` (declared or detected) and mapped through the table; nothing
    when there is none;
  - a copy button writing the block's `textContent` with
    `navigator.clipboard.writeText` (no network, so outside the SDK rule),
    "Copied" feedback for 2 seconds, hidden when the API is unavailable;
  - the current `pre` styles move here.
- **Theme.** A stylesheet maps `.hljs-*` classes to Tailwind tokens, with a
  light and a dark palette (`prefers-color-scheme` like the rest of the app).
  The bundled highlight.js CSS themes are not imported.
- Server-side rendering works unchanged: highlighting is synchronous.

### C6. Toolbar and shortcuts (`components/composer-toolbar.tsx`)

- Buttons: bold, italic, strikethrough, inline code, code block, quote,
  bulleted list, numbered list, link. Active state through `useEditorState`;
  every button has an `aria-label` and a Radix tooltip carrying its shortcut.
- **Shortcuts** live in one table (`lib/composer-shortcuts.ts`), read by the
  tooltips, the help panel and the keymap configuration. Defaults are TipTap's
  (for instance `Mod-Alt-c` for the code block, per its docs); the exact keys
  are checked against the installed version at implementation and any
  conflict with a browser or mention shortcut is overridden in that table.
  `Mod+K` is ours (link).
- **Help panel.** A shared `Dialog` opened by a `?` button, listing the
  shortcuts (from the table) and the supported Markdown syntax.
- **Layout.** From `md` up the toolbar is always visible above the input.
  Below `md` it is collapsed behind an "Aa" toggle (component state, closed on
  mount). The toolbar renders only once the editor exists (SSR: F1's
  `immediatelyRender: false` placeholder).
- All labels are French + English catalogue keys under `chat.composer.*`.

### C7. Sharing with message editing

`MessageEditor` (`components/message-editor.tsx`) holds editor, toolbar, link
popover, counter and Enter handling; `Composer` wraps it with the send button
and the disabled states. The edit UI of
[`web-client-message-actions`](../web-client-message-actions/overview.md)
reuses `MessageEditor` with its own submit and cancel (Escape) handlers. If
that edit UI ends up in another feature, `MessageEditor` moves to
`shared/messages` then (F11 of the mentions design: features never import one
another).

### C8. Length counter (`hooks/use-messages-policy.ts`)

- `useMessagesPolicy()`: TanStack Query on `sdk.messages.policy()`,
  `staleTime` 60 s. It is also invalidated when a send fails with
  `message.body_too_long`, so a limit lowered on the server is picked up.
- `MessageEditor` measures `getMarkdown().trim().length`, mention tokens
  included, on each update.
- The counter shows `used / max` from 80 % of the limit; above the limit it
  turns to the error tone and the send button and Enter are disabled.
- While the policy is loading or failed, there is no counter and no client
  block: the server `422` stays the safety net (already mapped to
  `body_too_long`).

## 6. Order and dependencies

- Server S1, then SDK, are independent of the client work.
- Rendering (C5) only needs the `shared/messages` move made by
  [web-client-mentions #176](../web-client-mentions/technical.md); it can ship
  before the editor work and gives code blocks value on its own.
- The editor work (C1 to C4, C6 to C8) needs the TipTap composer of
  web-client-mentions #177.
- Counter (C8) needs S1 and the SDK.
- Docs: a new `docs/technical/web-client-composer-formatting.md` (toolbar
  choices, Enter rules, `rehype-highlight` vs Shiki, policy endpoint
  alternatives), linked from the technical README. Two existing pages change:
  [web-client-composer-editor](../../../../docs/technical/web-client-composer-editor.md)
  (Enter no longer inserts a new line in lists or code) and
  [web-client-chat](../../../../docs/technical/web-client-chat.md) (the client now
  knows the length limit).

New client dependencies: `rehype-highlight`, `highlight.js`,
`@radix-ui/react-tooltip`, `@radix-ui/react-popover`. Server: none.

## 7. Tests

- **Server, e2e** (`conversations-messages-policy.e2e-spec.ts`): public access,
  `no-store`, value follows `messages.body_max_length` after a config change.
  OpenAPI emit test updated. A body with a fenced code block and an info
  string is accepted.
- **SDK:** `messages.policy()` resource test, `MessagesPolicy` schema test.
- **Client, unit:**
  - extension set: heading, rule and image inputs stay literal text; the
    serialised body always passes the server subset (round trip on samples);
  - input rules and their revert;
  - `SendOnEnter`: Enter sends in paragraph, list and code; Shift+Enter cases;
    triple Shift+Enter exits a block; IME; open mention popup wins;
  - links: scheme refusal, edit range, remove, paste over selection, bare URL;
  - paste: supported formatting kept, headings / tables / images / colours
    reduced to text, plain paste not parsed as Markdown;
  - code language normalisation (alias, unknown to `text`, none);
  - renderer: highlighting, detection, plain text, unknown language, label,
    copy button, raw `<span>` inert, allow-list test updated;
  - toolbar: active states, tooltips with shortcuts, help panel, "Aa" toggle;
  - counter: thresholds, disabled send over the limit, policy failure.
- No test relies on the textarea (replaced by #177).

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`, label `feature:web-client-composer-formatting`, in dependency order.

| Issue | Task | Depends on |
| ----- | ---- | ---------- |
| [#190](https://github.com/marmotz/ekoz/issues/190) | Server: public `GET /messages/policy` (S1) | none |
| [#191](https://github.com/marmotz/ekoz/issues/191) | SDK: `messages.policy()` binding (§4) | #190 |
| [#192](https://github.com/marmotz/ekoz/issues/192) | Client: highlighted code blocks with label and copy (C5) | #176 |
| [#193](https://github.com/marmotz/ekoz/issues/193) | Client: editor extensions, Enter rules, toolbar and shortcuts (C1, C2, C6, C7) | #177 |
| [#194](https://github.com/marmotz/ekoz/issues/194) | Client: link popover and link rules (C3) | #193 |
| [#195](https://github.com/marmotz/ekoz/issues/195) | Client: code block language selector (C4) | #193, #192 |
| [#196](https://github.com/marmotz/ekoz/issues/196) | Client: message length counter (C8) | #193, #191 |
| [#197](https://github.com/marmotz/ekoz/issues/197) | Docs: `docs/technical/web-client-composer-formatting.md` (§6) | #192, #193, #194, #195, #196 |
