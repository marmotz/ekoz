import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useWindowActive } from '@/shared/lib/use-window-active';

function setState(visible: boolean, focused: boolean) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visible ? 'visible' : 'hidden');
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('is active when the page is visible and focused', () => {
  setState(true, true);

  const { result } = renderHook(() => useWindowActive());

  expect(result.current).toBe(true);
});

it('is inactive when the page is visible but not focused', () => {
  setState(true, false);

  const { result } = renderHook(() => useWindowActive());

  expect(result.current).toBe(false);
});

it('follows blur, focus and visibility changes', () => {
  setState(true, true);
  const { result } = renderHook(() => useWindowActive());

  act(() => {
    setState(true, false);
    window.dispatchEvent(new Event('blur'));
  });
  expect(result.current).toBe(false);

  act(() => {
    setState(true, true);
    window.dispatchEvent(new Event('focus'));
  });
  expect(result.current).toBe(true);

  act(() => {
    setState(false, true);
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(result.current).toBe(false);
});

it('stops listening on unmount', () => {
  setState(true, true);
  const remove = vi.spyOn(window, 'removeEventListener');
  const { unmount } = renderHook(() => useWindowActive());

  unmount();

  expect(remove).toHaveBeenCalledWith('focus', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('blur', expect.any(Function));
});
