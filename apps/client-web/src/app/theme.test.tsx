import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '@/app/theme';
import { themeScript } from '@/app/theme-script';
import { THEME_STORAGE_KEY, useTheme } from '@/app/use-theme';

type Listener = () => void;

/** A controllable `prefers-color-scheme` media query. */
function mockColorScheme(initiallyDark: boolean) {
  let dark = initiallyDark;
  const listeners = new Set<Listener>();
  const original = window.matchMedia;

  const define = (value: unknown) =>
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value });

  define((query: string) => ({
    get matches() {
      return dark;
    },
    media: query,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }));

  return {
    set(next: boolean) {
      dark = next;
      for (const listener of listeners) listener();
    },
    restore() {
      define(original);
    },
  };
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('ThemeProvider', () => {
  let colorScheme: ReturnType<typeof mockColorScheme>;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    colorScheme = mockColorScheme(false);
  });

  afterEach(() => {
    colorScheme.restore();
    document.documentElement.classList.remove('dark');
  });

  it('applies the dark class and persists the choice', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme('dark'));

    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('removes the dark class when switching to light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme('dark'));
    act(() => result.current.setTheme('light'));

    expect(isDark()).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('reads the previously stored theme on mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe('dark');
    expect(isDark()).toBe(true);
  });

  it('follows prefers-color-scheme in system mode', () => {
    colorScheme.set(true);
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe('system');
    expect(isDark()).toBe(true);

    act(() => colorScheme.set(false));
    expect(isDark()).toBe(false);

    act(() => colorScheme.set(true));
    expect(isDark()).toBe(true);
  });

  it('ignores prefers-color-scheme once a theme is chosen', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme('light'));
    act(() => colorScheme.set(true));

    expect(isDark()).toBe(false);
  });

  it('forgets the stored choice when going back to system', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme('dark'));
    act(() => result.current.setTheme('system'));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('throws outside a provider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });
});

describe('themeScript', () => {
  let colorScheme: ReturnType<typeof mockColorScheme>;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    colorScheme = mockColorScheme(false);
  });

  afterEach(() => {
    colorScheme.restore();
    document.documentElement.classList.remove('dark');
  });

  const runScript = () => new Function(themeScript)();

  it('sets the dark class for a stored dark theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    runScript();

    expect(isDark()).toBe(true);
  });

  it('leaves the class off for a stored light theme, even if the system is dark', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    colorScheme.set(true);

    runScript();

    expect(isDark()).toBe(false);
  });

  it('follows the system when nothing is stored', () => {
    colorScheme.set(true);

    runScript();

    expect(isDark()).toBe(true);
  });
});
