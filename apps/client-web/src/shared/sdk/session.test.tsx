import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { SdkProvider } from '@/shared/sdk/provider';
import { useSession } from '@/shared/sdk/session';
import { createClientMock, createFakeSdk } from '../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);

const wrapper = ({ children }: { children: ReactNode }) => <SdkProvider>{children}</SdkProvider>;

beforeEach(() => {
  createClientMock.mockReset();
});

it('is unknown while the SDK is not up, then authenticated on session:authenticated', async () => {
  const fake = createFakeSdk();
  let finishResume: () => void = () => {};
  fake.stubs.session.resume.mockReturnValue(new Promise((resolve) => (finishResume = resolve)));
  createClientMock.mockReturnValue(fake.sdk);

  const { result } = renderHook(() => useSession(), { wrapper });
  expect(result.current).toEqual({ status: 'unknown', identifier: null, sessionId: null });

  await act(async () => finishResume());
  await waitFor(() => expect(result.current.status).toBe('anonymous'));

  act(() => {
    fake.setSession({ identifier: 'alice@ekoz.test', sessionId: 'session-1' });
    fake.emit('session:authenticated', { identifier: 'alice@ekoz.test', sessionId: 'session-1' });
  });

  expect(result.current).toEqual({
    status: 'authenticated',
    identifier: 'alice@ekoz.test',
    sessionId: 'session-1',
  });
});

it('starts authenticated when resume() restored a session', async () => {
  const fake = createFakeSdk({ identifier: null, sessionId: 'session-9' });
  createClientMock.mockReturnValue(fake.sdk);

  const { result } = renderHook(() => useSession(), { wrapper });

  await waitFor(() =>
    expect(result.current).toEqual({
      status: 'authenticated',
      identifier: null,
      sessionId: 'session-9',
    }),
  );
});

it('becomes anonymous on session:invalid and on session:cleared', async () => {
  const fake = createFakeSdk({ identifier: 'alice@ekoz.test', sessionId: 'session-1' });
  createClientMock.mockReturnValue(fake.sdk);
  const { result } = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('authenticated'));

  act(() => {
    fake.setSession(undefined);
    fake.emit('session:invalid', { reason: 'refresh_failed' });
  });
  expect(result.current.status).toBe('anonymous');

  act(() => {
    fake.setSession({ identifier: null, sessionId: 'session-2' });
    fake.emit('session:refreshed', { sessionId: 'session-2' });
  });
  expect(result.current.status).toBe('authenticated');

  act(() => {
    fake.setSession(undefined);
    fake.emit('session:cleared', {});
  });
  expect(result.current.status).toBe('anonymous');
});

it('unsubscribes from the SDK events on unmount', async () => {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);
  const { result, unmount } = renderHook(() => useSession(), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('anonymous'));
  expect(fake.listenerCount('session:authenticated')).toBe(1);

  unmount();

  expect(fake.listenerCount('session:authenticated')).toBe(0);
  expect(fake.listenerCount('session:invalid')).toBe(0);
});
