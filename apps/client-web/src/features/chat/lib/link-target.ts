import { type Editor, getMarkRange } from '@tiptap/react';

/** What the popover edits: a range of the document, the text on it and the link it carries. */
export interface LinkTarget {
  from: number;
  to: number;
  text: string;
  href: string;
  /** True when the range is an existing link. */
  editing: boolean;
}

/**
 * The link under the cursor (its whole range), else the selection, else an empty
 * range at the cursor (web-client-composer-formatting technical design C3).
 */
export function readLinkTarget(editor: Editor): LinkTarget {
  const { state } = editor;
  const { from, to, empty, $from } = state.selection;
  const range = state.schema.marks.link ? getMarkRange($from, state.schema.marks.link) : undefined;

  if (range && (empty || (from >= range.from && to <= range.to))) {
    return {
      from: range.from,
      to: range.to,
      text: state.doc.textBetween(range.from, range.to),
      href: (editor.getAttributes('link').href as string | undefined) ?? '',
      editing: true,
    };
  }
  return { from, to, text: state.doc.textBetween(from, to), href: '', editing: false };
}
