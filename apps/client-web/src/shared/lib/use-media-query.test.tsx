import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { useMediaQuery } from '@/shared/lib/use-media-query';

const original = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
});

it('follows the media query as it changes and unsubscribes on unmount', () => {
  let matches = false;
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }),
  });

  const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
  expect(result.current).toBe(false);

  act(() => {
    matches = true;
    for (const listener of listeners) listener();
  });
  expect(result.current).toBe(true);

  unmount();
  expect(listeners.size).toBe(0);
});
