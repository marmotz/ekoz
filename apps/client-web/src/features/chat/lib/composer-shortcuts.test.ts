import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestEditor,
  press,
  type TestEditor,
} from '@/features/chat/lib/composer-editor.test-helper';
import {
  COMPOSER_SHORTCUT_KEYS,
  formatShortcut,
  shortcutLabel,
} from '@/features/chat/lib/composer-shortcuts';

let current: TestEditor | undefined;
afterEach(() => {
  current?.editor.destroy();
  current = undefined;
});

describe('formatShortcut', () => {
  it('spells the keys out off macOS', () => {
    expect(formatShortcut('Mod-b', false)).toBe('Ctrl+B');
    expect(formatShortcut('Mod-Shift-s', false)).toBe('Ctrl+Shift+S');
    expect(formatShortcut('Mod-Alt-c', false)).toBe('Ctrl+Alt+C');
    expect(formatShortcut('Shift-Enter', false)).toBe('Shift+Enter');
  });

  it('uses the macOS symbols', () => {
    expect(formatShortcut('Mod-b', true)).toBe('⌘B');
    expect(formatShortcut('Mod-Shift-s', true)).toBe('⌘⇧S');
    expect(shortcutLabel('codeBlock', true)).toBe('⌘⌥C');
  });

  it('has one distinct key per action', () => {
    const keys = Object.values(COMPOSER_SHORTCUT_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('keymap', () => {
  const chord = (keys: string) => {
    const parts = keys.split('-');
    const key = parts[parts.length - 1] as string;
    return {
      key,
      ctrlKey: parts.includes('Mod'),
      shiftKey: parts.includes('Shift'),
      altKey: parts.includes('Alt'),
    };
  };

  it.each([
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['strike', 'strike'],
    ['code', 'code'],
    ['codeBlock', 'codeBlock'],
    ['blockquote', 'blockquote'],
    ['bulletList', 'bulletList'],
    ['orderedList', 'orderedList'],
  ] as const)('runs the %s shortcut of the table', (id, active) => {
    current = createTestEditor('text');
    const { editor } = current;
    editor.commands.setTextSelection({ from: 1, to: 5 });

    const init = chord(COMPOSER_SHORTCUT_KEYS[id]);
    expect(press(editor, init.key, init)).toBe(true);

    expect(editor.isActive(active), id).toBe(true);
  });

  it('opens the link popover with Mod-k', () => {
    current = createTestEditor('text');

    const init = chord(COMPOSER_SHORTCUT_KEYS.link);
    expect(press(current.editor, init.key, init)).toBe(true);

    expect(current.openLink).toHaveBeenCalledTimes(1);
  });

  it('cancels an edit with Escape when the handler takes it', () => {
    current = createTestEditor('text');

    expect(press(current.editor, 'Escape')).toBe(true);

    expect(current.cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape alone when there is nothing to cancel', () => {
    current = createTestEditor('text');
    current.cancel.mockReturnValue(false);

    expect(press(current.editor, 'Escape')).toBe(false);
  });
});
