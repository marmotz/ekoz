import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearUnseen,
  markUnseen,
  resetUnseen,
  useIsUnseen,
} from '@/features/direct-messages/lib/unseen-store';

afterEach(() => resetUnseen());

describe('unseen store', () => {
  it('follows the marks of one conversation', () => {
    const { result } = renderHook(() => useIsUnseen('c1'));
    const other = renderHook(() => useIsUnseen('c2'));
    expect(result.current).toBe(false);

    act(() => markUnseen('c1'));
    expect(result.current).toBe(true);
    expect(other.result.current).toBe(false);

    act(() => clearUnseen('c1'));
    expect(result.current).toBe(false);
  });

  it('forgets everything on reset', () => {
    const { result } = renderHook(() => useIsUnseen('c1'));
    act(() => markUnseen('c1'));

    act(() => resetUnseen());

    expect(result.current).toBe(false);
  });
});
