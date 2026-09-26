import { Extension } from '@tiptap/react';

/**
 * The single shortcut table of the composer (web-client-composer-formatting
 * technical design C6): read by the toolbar tooltips, the help panel and the
 * keymap below, so the three cannot drift.
 *
 * Keys use TipTap's notation (`Mod` is Ctrl, or Command on macOS). The defaults are
 * TipTap's own; none is reserved by the browsers, so `preventDefault` wins over
 * their own binding (`Mod-k`, `Mod-e`, `Mod-Shift-b`).
 */
export const COMPOSER_SHORTCUT_KEYS = {
  bold: 'Mod-b',
  italic: 'Mod-i',
  strike: 'Mod-Shift-s',
  code: 'Mod-e',
  codeBlock: 'Mod-Alt-c',
  blockquote: 'Mod-Shift-b',
  bulletList: 'Mod-Shift-8',
  orderedList: 'Mod-Shift-7',
  link: 'Mod-k',
  send: 'Enter',
  newline: 'Shift-Enter',
} as const;

export type ComposerShortcutId = keyof typeof COMPOSER_SHORTCUT_KEYS;

/** Shortcuts bound to a formatting command by {@link ComposerShortcuts}. */
export type FormattingShortcutId = Exclude<ComposerShortcutId, 'send' | 'newline'>;

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** A shortcut as shown to the user: `Ctrl+Shift+S`, or `⌘⇧S` on macOS. */
export function formatShortcut(keys: string, mac = isMac()): string {
  const parts = keys.split('-').map((part) => {
    switch (part) {
      case 'Mod':
        return mac ? '⌘' : 'Ctrl';
      case 'Shift':
        return mac ? '⇧' : 'Shift';
      case 'Alt':
        return mac ? '⌥' : 'Alt';
      default:
        return part.length === 1 ? part.toUpperCase() : part;
    }
  });
  return mac ? parts.join('') : parts.join('+');
}

export const shortcutLabel = (id: ComposerShortcutId, mac?: boolean) =>
  formatShortcut(COMPOSER_SHORTCUT_KEYS[id], mac);

export interface ComposerShortcutsOptions {
  /** `Mod-k`: opens the link popover. */
  onLink: () => void;
  /** `Escape`: cancels an edit. Return false to leave the key alone. */
  onCancel: () => boolean;
}

/** Binds the formatting entries of the table to their editor command. */
export const ComposerShortcuts = Extension.create<ComposerShortcutsOptions>({
  name: 'composerShortcuts',
  priority: 1000,

  addOptions() {
    return { onLink: () => {}, onCancel: () => false };
  },

  addKeyboardShortcuts() {
    const { editor, options } = this;
    const run: Record<FormattingShortcutId, () => boolean> = {
      bold: () => editor.commands.toggleBold(),
      italic: () => editor.commands.toggleItalic(),
      strike: () => editor.commands.toggleStrike(),
      code: () => editor.commands.toggleCode(),
      codeBlock: () => editor.commands.toggleCodeBlock(),
      blockquote: () => editor.commands.toggleBlockquote(),
      bulletList: () => editor.commands.toggleBulletList(),
      orderedList: () => editor.commands.toggleOrderedList(),
      link: () => {
        options.onLink();
        return true;
      },
    };

    return {
      ...Object.fromEntries(
        (Object.keys(run) as FormattingShortcutId[]).map((id) => [
          COMPOSER_SHORTCUT_KEYS[id],
          run[id],
        ]),
      ),
      Escape: () => options.onCancel(),
    };
  },
});
