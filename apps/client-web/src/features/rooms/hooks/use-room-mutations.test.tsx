import { EkozError } from '@ekozhq/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useAcceptInvitation,
  useApproveJoinRequest,
  useCreateChannel,
  useCreateSpace,
  useDeclineInvitation,
  useJoinRoom,
  useLeaveRoom,
  useRejectJoinRequest,
  useRequestToJoin,
} from '@/features/rooms/hooks/use-room-mutations';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../../test/sdk-mock';

type Fake = ReturnType<typeof createFakeSdk>;

function setup() {
  const fake = createFakeSdk();
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);

  return { fake, wrapper, invalidatedKeys };
}

interface Case {
  name: string;
  // `never`: each case has its own mutation variables.
  useHook: () => { mutateAsync: (variables: never) => Promise<unknown> };
  variables: unknown;
  call: (fake: Fake) => ReturnType<typeof vi.fn>;
  args: unknown[];
  keys: unknown[];
}

const cases: Case[] = [
  {
    name: 'useCreateSpace',
    useHook: useCreateSpace,
    variables: { name: 'Team' },
    call: ({ stubs }) => stubs.rooms.createSpace,
    args: [{ name: 'Team' }],
    keys: [['rooms', 'list']],
  },
  {
    name: 'useCreateChannel',
    useHook: useCreateChannel,
    variables: { name: 'general', parentId: 's1' },
    call: ({ stubs }) => stubs.rooms.createChannel,
    args: [{ name: 'general', parentId: 's1' }],
    keys: [['rooms', 'list']],
  },
  {
    name: 'useJoinRoom',
    useHook: useJoinRoom,
    variables: 'r1',
    call: ({ stubs }) => stubs.rooms.join,
    args: ['r1'],
    keys: [
      ['rooms', 'list'],
      ['rooms', 'permissions', 'r1'],
    ],
  },
  {
    name: 'useLeaveRoom',
    useHook: useLeaveRoom,
    variables: 'r1',
    call: ({ stubs }) => stubs.rooms.leave,
    args: ['r1'],
    keys: [
      ['rooms', 'list'],
      ['rooms', 'permissions', 'r1'],
    ],
  },
  {
    name: 'useRequestToJoin',
    useHook: useRequestToJoin,
    variables: 'r1',
    call: ({ stubs }) => stubs.rooms.requestToJoin,
    args: ['r1'],
    keys: [['rooms', 'preview', 'r1']],
  },
  {
    name: 'useAcceptInvitation',
    useHook: useAcceptInvitation,
    variables: { invitationId: 'i1', roomId: 'r1' },
    call: ({ stubs }) => stubs.roomInvitations.accept,
    args: ['i1'],
    keys: [
      ['rooms', 'list'],
      ['rooms', 'invitations'],
      ['rooms', 'permissions', 'r1'],
    ],
  },
  {
    name: 'useDeclineInvitation',
    useHook: useDeclineInvitation,
    variables: { invitationId: 'i1', roomId: 'r1' },
    call: ({ stubs }) => stubs.roomInvitations.decline,
    args: ['i1'],
    keys: [
      ['rooms', 'list'],
      ['rooms', 'invitations'],
      ['rooms', 'permissions', 'r1'],
      ['rooms', 'detail', 'r1'],
    ],
  },
  {
    name: 'useApproveJoinRequest',
    useHook: useApproveJoinRequest,
    variables: { roomId: 'r1', requestId: 'q1' },
    call: ({ stubs }) => stubs.rooms.approveJoinRequest,
    args: ['r1', 'q1'],
    keys: [
      ['rooms', 'join-requests', 'r1'],
      ['rooms', 'list'],
    ],
  },
  {
    name: 'useRejectJoinRequest',
    useHook: useRejectJoinRequest,
    variables: { roomId: 'r1', requestId: 'q1' },
    call: ({ stubs }) => stubs.rooms.rejectJoinRequest,
    args: ['r1', 'q1'],
    keys: [['rooms', 'join-requests', 'r1']],
  },
];

describe.each(cases)('$name', ({ useHook, variables, call, args, keys }) => {
  it('calls its SDK method and invalidates what it changes', async () => {
    const { fake, wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(useHook, { wrapper });

    await act(() => result.current.mutateAsync(variables as never));

    expect(call(fake)).toHaveBeenCalledWith(...args);
    expect(invalidatedKeys()).toEqual(keys);
  });
});

describe('on failure', () => {
  const conflict = (code: string) => new EkozError({ code, status: 409 });

  it('refreshes the list when joining a room the caller is already in', async () => {
    const { fake, wrapper, invalidatedKeys } = setup();
    fake.stubs.rooms.join.mockRejectedValue(conflict('room.already_member'));
    const { result } = renderHook(useJoinRoom, { wrapper });

    await act(() => result.current.mutateAsync('r1').catch(() => {}));

    expect(invalidatedKeys()).toEqual([
      ['rooms', 'list'],
      ['rooms', 'permissions', 'r1'],
    ]);
  });

  it('invalidates nothing on another join failure', async () => {
    const { fake, wrapper, invalidatedKeys } = setup();
    fake.stubs.rooms.join.mockRejectedValue(conflict('room.banned'));
    const { result } = renderHook(useJoinRoom, { wrapper });

    await act(() => result.current.mutateAsync('r1').catch(() => {}));

    expect(invalidatedKeys()).toEqual([]);
  });

  it('refreshes the pending requests when one was resolved elsewhere', async () => {
    const { fake, wrapper, invalidatedKeys } = setup();
    fake.stubs.rooms.rejectJoinRequest.mockRejectedValue(
      conflict('room.join_request_already_resolved'),
    );
    const { result } = renderHook(useRejectJoinRequest, { wrapper });

    await act(() => result.current.mutateAsync({ roomId: 'r1', requestId: 'q1' }).catch(() => {}));

    expect(invalidatedKeys()).toEqual([['rooms', 'join-requests', 'r1']]);
  });

  it('refreshes the invitations when one was answered elsewhere', async () => {
    const { fake, wrapper, invalidatedKeys } = setup();
    fake.stubs.roomInvitations.accept.mockRejectedValue(
      conflict('room.invitation_already_resolved'),
    );
    const { result } = renderHook(useAcceptInvitation, { wrapper });

    await act(() =>
      result.current.mutateAsync({ invitationId: 'i1', roomId: 'r1' }).catch(() => {}),
    );

    expect(invalidatedKeys()).toContainEqual(['rooms', 'invitations']);
  });
});
