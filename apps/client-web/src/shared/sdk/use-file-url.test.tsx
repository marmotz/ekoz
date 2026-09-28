import type { EkozClient, FileRef } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { useFileUrl } from '@/shared/sdk/use-file-url';
import { SdkContext } from '@/shared/sdk/use-sdk';

function setup(sdk: EkozClient | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  return wrapper;
}

function refId(ref: FileRef): string {
  return ref.kind === 'attachment'
    ? ref.id
    : ref.kind === 'preview'
      ? ref.previewId
      : ref.messageId;
}

function sdkWith() {
  const urls = vi.fn(async (refs: FileRef[]) => ({
    items: refs.map((ref) => ({
      ref,
      url: `https://files.test/${refId(ref)}`,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })),
  }));
  return { sdk: { files: { urls } } as unknown as EkozClient, urls };
}

it('resolves the signed url for a ref', async () => {
  const { sdk } = sdkWith();
  const ref: FileRef = { kind: 'attachment', id: 'a1', variant: 'original' };

  const { result } = renderHook(() => useFileUrl(ref), { wrapper: setup(sdk) });

  await waitFor(() => expect(result.current).toBe('https://files.test/a1'));
});

it('batches refs requested in the same tick into one call', async () => {
  const { sdk, urls } = sdkWith();
  const refA: FileRef = { kind: 'attachment', id: 'a1', variant: 'original' };
  const refB: FileRef = { kind: 'attachment', id: 'a2', variant: 'thumbnail' };

  function useBoth() {
    return [useFileUrl(refA), useFileUrl(refB)] as const;
  }

  const { result } = renderHook(useBoth, { wrapper: setup(sdk) });

  await waitFor(() =>
    expect(result.current).toEqual(['https://files.test/a1', 'https://files.test/a2']),
  );
  expect(urls).toHaveBeenCalledTimes(1);
});

it('does not request anything for a null ref', () => {
  const { sdk, urls } = sdkWith();

  const { result } = renderHook(() => useFileUrl(null), { wrapper: setup(sdk) });

  expect(result.current).toBeUndefined();
  expect(urls).not.toHaveBeenCalled();
});

it('does not request anything before the SDK has started', () => {
  const ref: FileRef = { kind: 'attachment', id: 'a1', variant: 'original' };

  const { result } = renderHook(() => useFileUrl(ref), { wrapper: setup(null) });

  expect(result.current).toBeUndefined();
});
