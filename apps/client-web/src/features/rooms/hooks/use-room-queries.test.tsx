import type { EkozClient } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  useDirectory,
  useInvitations,
  useJoinRequests,
  useMyPermissions,
  useRoom,
  useRoomPreview,
  useRooms,
} from '@/features/rooms/hooks/use-room-queries';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../../test/sdk-mock';

type Fake = ReturnType<typeof createFakeSdk>;

function wrapper(sdk: EkozClient | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
}

const cases: [string, () => { isSuccess: boolean; fetchStatus: string }, (fake: Fake) => void][] = [
  ['useRooms', () => useRooms(), ({ stubs }) => expect(stubs.rooms.list).toHaveBeenCalledWith()],
  [
    'useInvitations',
    () => useInvitations(),
    ({ stubs }) => expect(stubs.roomInvitations.listMine).toHaveBeenCalledWith(),
  ],
  [
    'useRoom',
    () => useRoom('r1'),
    ({ stubs }) => expect(stubs.rooms.get).toHaveBeenCalledWith('r1'),
  ],
  [
    'useRoomPreview',
    () => useRoomPreview('r1'),
    ({ stubs }) => expect(stubs.rooms.preview).toHaveBeenCalledWith('r1'),
  ],
  [
    'useMyPermissions',
    () => useMyPermissions('r1'),
    ({ stubs }) => expect(stubs.rooms.myPermissions).toHaveBeenCalledWith('r1'),
  ],
  [
    'useDirectory',
    () => useDirectory('gen'),
    ({ stubs }) =>
      expect(stubs.directory.list).toHaveBeenCalledWith({ query: 'gen', cursor: undefined }),
  ],
  [
    'useJoinRequests',
    () => useJoinRequests('r1'),
    ({ stubs }) =>
      expect(stubs.rooms.listJoinRequests).toHaveBeenCalledWith('r1', { cursor: undefined }),
  ],
];

describe.each(cases)('%s', (_name, useHook, assertCall) => {
  it('calls its SDK method', async () => {
    const fake = createFakeSdk();

    const { result } = renderHook(useHook, { wrapper: wrapper(fake.sdk) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    assertCall(fake);
  });

  it('stays idle without a client', () => {
    const { result } = renderHook(useHook, { wrapper: wrapper(null) });

    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe.each<[string, () => { fetchStatus: string }]>([
  ['useRoom', () => useRoom('r1', { enabled: false })],
  ['useRoomPreview', () => useRoomPreview('r1', { enabled: false })],
  ['useMyPermissions', () => useMyPermissions('r1', { enabled: false })],
])('%s', (_name, useHook) => {
  it('stays idle while disabled', () => {
    const fake = createFakeSdk();

    const { result } = renderHook(useHook, { wrapper: wrapper(fake.sdk) });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fake.stubs.rooms.get).not.toHaveBeenCalled();
    expect(fake.stubs.rooms.preview).not.toHaveBeenCalled();
    expect(fake.stubs.rooms.myPermissions).not.toHaveBeenCalled();
  });
});
