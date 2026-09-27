import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { useLinkPreview } from '@/features/chat/hooks/use-link-preview';
import { SdkContext } from '@/shared/sdk/use-sdk';

function wrapper(sdk: EkozClient | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
}

const preview = {
  id: 'p1',
  url: 'https://example.test',
  title: 'Example',
  description: 'A page',
  siteName: 'example.test',
  hasImage: false,
};

function sdkWith(fetch = vi.fn(async () => preview)) {
  return { sdk: { linkPreviews: { fetch } } as unknown as EkozClient, fetch };
}

it('does nothing when the option is off', async () => {
  const { sdk, fetch } = sdkWith();
  const { result } = renderHook(() => useLinkPreview('see https://example.test', false), {
    wrapper: wrapper(sdk),
  });

  expect(result.current.links).toEqual([]);
  expect(result.current.chosenUrl).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(fetch).not.toHaveBeenCalled();
});

it('fetches the first link after the debounce delay', async () => {
  const { sdk, fetch } = sdkWith();
  const { result } = renderHook(() => useLinkPreview('see https://example.test', true), {
    wrapper: wrapper(sdk),
  });

  expect(fetch).not.toHaveBeenCalled();

  await waitFor(() => expect(fetch).toHaveBeenCalledWith('https://example.test'), {
    timeout: 2000,
  });
  await waitFor(() => expect(result.current.preview).toEqual(preview));
});

it('cycles to the next link and back around', async () => {
  const { sdk } = sdkWith();
  const { result } = renderHook(() => useLinkPreview('https://a.test then https://b.test', true), {
    wrapper: wrapper(sdk),
  });

  expect(result.current.chosenUrl).toBe('https://a.test');
  result.current.next();
  await waitFor(() => expect(result.current.chosenUrl).toBe('https://b.test'));
  result.current.next();
  await waitFor(() => expect(result.current.chosenUrl).toBe('https://a.test'));
});

it('dismissing clears the choice until the body changes', async () => {
  const { sdk, fetch } = sdkWith();
  const { result, rerender } = renderHook(
    ({ body }: { body: string }) => useLinkPreview(body, true),
    { wrapper: wrapper(sdk), initialProps: { body: 'https://a.test' } },
  );

  result.current.dismiss();
  await waitFor(() => expect(result.current.chosenUrl).toBeNull());
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(fetch).not.toHaveBeenCalled();

  rerender({ body: 'https://b.test' });
  await waitFor(() => expect(result.current.chosenUrl).toBe('https://b.test'));
});

it('reset clears the dismissal and the cycled index', async () => {
  const { sdk } = sdkWith();
  const { result } = renderHook(() => useLinkPreview('https://a.test then https://b.test', true), {
    wrapper: wrapper(sdk),
  });

  result.current.next();
  await waitFor(() => expect(result.current.chosenUrl).toBe('https://b.test'));
  result.current.dismiss();
  await waitFor(() => expect(result.current.chosenUrl).toBeNull());

  result.current.reset();
  await waitFor(() => expect(result.current.chosenUrl).toBe('https://a.test'));
});
