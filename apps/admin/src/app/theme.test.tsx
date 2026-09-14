import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from '@/app/theme';

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('applies the dark class and persists the choice', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme('dark'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('removes the dark class when switching to light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => result.current.setTheme('dark'));
    act(() => result.current.setTheme('light'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('reads the previously stored theme on mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme).toBe('dark');
  });
});
