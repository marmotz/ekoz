import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAvatarSrc } from '@/shared/sdk/use-avatar-src';
import { SdkContext } from '@/shared/sdk/use-sdk';

const blob = new Blob(['a'], { type: 'image/png' });
let counter = 0;

beforeEach(() => {
  counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:avatar-${++counter}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(sdk: EkozClient | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  return wrapper;
}

function sdkWith(avatar = vi.fn(async () => blob)) {
  return { sdk: { users: { avatar } } as unknown as EkozClient, avatar };
}

it('fetches the avatar with the version of the url and exposes an object URL', async () => {
  const { sdk, avatar } = sdkWith();

  const { result } = renderHook(
    () => useAvatarSrc('jane/example.test', 'http://localhost/users/jane/avatar?v=7'),
    { wrapper: setup(sdk) },
  );

  await waitFor(() => expect(result.current).toBe('blob:avatar-1'));
  expect(avatar).toHaveBeenCalledWith('jane/example.test', { version: '7' });
});

it('revokes the object URL on unmount', async () => {
  const { sdk } = sdkWith();

  const { result, unmount } = renderHook(() => useAvatarSrc('jane/example.test', '/a?v=1'), {
    wrapper: setup(sdk),
  });
  await waitFor(() => expect(result.current).toBe('blob:avatar-1'));
  unmount();

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-1');
});

it('refetches and revokes the previous object URL when the version changes', async () => {
  const { sdk, avatar } = sdkWith();

  const { result, rerender } = renderHook(({ url }) => useAvatarSrc('jane/example.test', url), {
    wrapper: setup(sdk),
    initialProps: { url: '/a?v=1' },
  });
  await waitFor(() => expect(result.current).toBe('blob:avatar-1'));

  rerender({ url: '/a?v=2' });

  await waitFor(() => expect(result.current).toBe('blob:avatar-2'));
  expect(avatar).toHaveBeenCalledTimes(2);
  expect(avatar).toHaveBeenLastCalledWith('jane/example.test', { version: '2' });
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-1');
});

it('does not request anything without an avatar url', () => {
  const { sdk, avatar } = sdkWith();

  const { result } = renderHook(() => useAvatarSrc('jane/example.test', null), {
    wrapper: setup(sdk),
  });

  expect(result.current).toBeNull();
  expect(avatar).not.toHaveBeenCalled();
});

it('does not request anything before the SDK has started', () => {
  const { result } = renderHook(() => useAvatarSrc('jane/example.test', '/a?v=1'), {
    wrapper: setup(null),
  });

  expect(result.current).toBeNull();
});

it('stays empty when the request fails', async () => {
  const { sdk, avatar } = sdkWith(vi.fn(async () => Promise.reject(new Error('offline'))));

  const { result } = renderHook(() => useAvatarSrc('jane/example.test', '/a?v=1'), {
    wrapper: setup(sdk),
  });

  await waitFor(() => expect(avatar).toHaveBeenCalled());
  expect(result.current).toBeNull();
});
