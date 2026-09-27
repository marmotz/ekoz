import { type EkozClient, EkozError } from '@ekozhq/sdk';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  useComposerUploads,
} from '@/features/chat/hooks/use-composer-uploads';
import { SdkContext } from '@/shared/sdk/use-sdk';

let counter = 0;

beforeEach(() => {
  counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapper(sdk: EkozClient) {
  return ({ children }: { children: ReactNode }) => (
    <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
  );
}

function file(name: string, type = 'application/pdf'): File {
  return new File(['x'], name, { type });
}

function deferredUpload() {
  let resolveResult!: (result: { id: string; state: 'ready' | 'failed' }) => void;
  const promise = new Promise<{ id: string; state: 'ready' | 'failed' }>((resolve) => {
    resolveResult = resolve;
  });
  const upload = vi.fn(async () => ({ id: 'up-1', promise }));
  return { upload, resolveResult };
}

function sdkWith(upload: ReturnType<typeof vi.fn>, cancel = vi.fn(async () => undefined)) {
  return { uploads: { upload, cancel } } as unknown as EkozClient;
}

it('uploads an added file and exposes it ready once finalized', async () => {
  const { upload, resolveResult } = deferredUpload();
  const sdk = sdkWith(upload);
  const { result } = renderHook(() => useComposerUploads(), { wrapper: wrapper(sdk) });

  act(() => result.current.add([file('a.pdf')]));

  expect(result.current.entries).toHaveLength(1);
  expect(result.current.entries[0]?.state).toBe('uploading');
  expect(result.current.busy).toBe(true);

  await act(async () => resolveResult({ id: 'up-1', state: 'ready' }));

  await waitFor(() => expect(result.current.entries[0]?.state).toBe('ready'));
  expect(result.current.readyIds).toEqual(['up-1']);
  expect(result.current.busy).toBe(false);
});

it('creates a preview object url only for image files', async () => {
  const { upload } = deferredUpload();
  const sdk = sdkWith(upload);
  const { result } = renderHook(() => useComposerUploads(), { wrapper: wrapper(sdk) });

  act(() => result.current.add([file('a.png', 'image/png'), file('b.pdf', 'application/pdf')]));

  expect(result.current.entries[0]?.previewUrl).toBe('blob:preview-1');
  expect(result.current.entries[1]?.previewUrl).toBeNull();
});

it('marks an entry failed with the mapped error code on a known EkozError', async () => {
  const upload = vi.fn(async () => {
    throw new EkozError({ code: 'upload.too_large', status: 413, title: 'x', detail: 'x' });
  });
  const sdk = sdkWith(upload);
  const { result } = renderHook(() => useComposerUploads(), { wrapper: wrapper(sdk) });

  act(() => result.current.add([file('a.pdf')]));

  await waitFor(() => expect(result.current.entries[0]?.state).toBe('failed'));
  expect(result.current.entries[0]?.error).toBe('upload.too_large');
});

it('retries a failed upload', async () => {
  let attempt = 0;
  const upload = vi.fn(async () => {
    attempt += 1;
    if (attempt === 1)
      throw new EkozError({ code: 'upload.too_large', status: 413, title: 'x', detail: 'x' });
    return { id: 'up-2', promise: Promise.resolve({ id: 'up-2', state: 'ready' as const }) };
  });
  const sdk = sdkWith(upload);
  const { result } = renderHook(() => useComposerUploads(), { wrapper: wrapper(sdk) });

  act(() => result.current.add([file('a.pdf')]));
  await waitFor(() => expect(result.current.entries[0]?.state).toBe('failed'));

  act(() => result.current.retry(result.current.entries[0]!.localId));

  await waitFor(() => expect(result.current.entries[0]?.state).toBe('ready'));
  expect(upload).toHaveBeenCalledTimes(2);
});

it('removes an entry, revokes its preview and cancels the upload', async () => {
  const { upload } = deferredUpload();
  const cancel = vi.fn(async () => undefined);
  const sdk = sdkWith(upload, cancel);
  const { result } = renderHook(() => useComposerUploads(), { wrapper: wrapper(sdk) });

  act(() => result.current.add([file('a.png', 'image/png')]));
  await waitFor(() => expect(result.current.entries[0]?.uploadId).toBe('up-1'));

  act(() => result.current.remove(result.current.entries[0]!.localId));

  expect(result.current.entries).toHaveLength(0);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  expect(cancel).toHaveBeenCalledWith('up-1');
});

it('caps the number of files added at the per-message maximum', () => {
  const { upload } = deferredUpload();
  const sdk = sdkWith(upload);
  const { result } = renderHook(() => useComposerUploads(), { wrapper: wrapper(sdk) });

  const files = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 3 }, (_, i) =>
    file(`f${i}.pdf`),
  );
  act(() => result.current.add(files));

  expect(result.current.entries).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
  expect(result.current.atLimit).toBe(true);
});

it('detaches only the ready entries with takeReady, keeping failed ones in the tray', async () => {
  const upload = vi
    .fn()
    .mockResolvedValueOnce({
      id: 'up-1',
      promise: Promise.resolve({ id: 'up-1', state: 'ready' as const }),
    })
    .mockRejectedValueOnce(
      new EkozError({ code: 'upload.too_large', status: 413, title: 'x', detail: 'x' }),
    );
  const sdk = sdkWith(upload);
  const { result } = renderHook(() => useComposerUploads(), { wrapper: wrapper(sdk) });

  act(() => result.current.add([file('a.pdf'), file('b.pdf')]));
  await waitFor(() =>
    expect(result.current.entries.map((e) => e.state)).toEqual(['ready', 'failed']),
  );

  let taken: ReturnType<typeof result.current.takeReady> = [];
  act(() => {
    taken = result.current.takeReady();
  });

  expect(taken).toHaveLength(1);
  expect(taken[0]?.uploadId).toBe('up-1');
  expect(result.current.entries).toHaveLength(1);
  expect(result.current.entries[0]?.state).toBe('failed');
});
