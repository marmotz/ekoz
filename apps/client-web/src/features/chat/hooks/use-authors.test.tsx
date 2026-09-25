import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useAuthors } from '@/features/chat/hooks/use-authors';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../../test/sdk-mock';

const member = (id: string, displayName: string | null, role = 'moderator') => ({
  role,
  joinedAt: '2026-01-01T00:00:00.000Z',
  user: { id, identifier: displayName ? `${id}/example.test` : null, displayName, avatarUrl: null },
});

const summary = (id: string, displayName: string | null) => ({
  id,
  identifier: displayName ? `${id}/example.test` : null,
  displayName,
  avatarUrl: null,
});

function setup(
  authorIds: (string | null)[],
  {
    members = [member('u1', 'Alice'), member('u3', null)],
    summaries = async (ids: readonly string[]) => ids.map((id) => summary(id, null)),
  }: {
    members?: unknown[];
    summaries?: (ids: readonly string[]) => Promise<unknown[]>;
  } = {},
) {
  const fake = createFakeSdk();
  fake.stubs.rooms.members.mockResolvedValue({ items: members, nextCursor: null } as never);
  fake.stubs.users.summaries.mockImplementation(summaries as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useAuthors('r1', authorIds), { wrapper });
  return { fake, ...hook };
}

describe('useAuthors', () => {
  it('is pending for everyone but the missing author until the members are loaded', async () => {
    const { result } = setup(['u1']);

    expect(result.current.resolve('u1').kind).toBe('pending');
    expect(result.current.resolve(null).kind).toBe('deleted');
    await waitFor(() => expect(result.current.resolve('u1').kind).toBe('member'));
  });

  it('resolves a member with their name, identifier and role', async () => {
    const { result } = setup(['u1']);

    await waitFor(() => expect(result.current.resolve('u1').kind).toBe('member'));

    expect(result.current.resolve('u1')).toEqual({
      kind: 'member',
      userId: 'u1',
      identifier: 'u1/example.test',
      displayName: 'Alice',
      avatarUrl: null,
      role: 'moderator',
    });
  });

  it('resolves a null author, or a member without a name, as deleted', async () => {
    const { result } = setup([null, 'u3']);

    await waitFor(() => expect(result.current.resolve('u3').kind).toBe('deleted'));

    expect(result.current.resolve(null)).toMatchObject({
      kind: 'deleted',
      userId: null,
      role: null,
    });
    expect(result.current.resolve('u3')).toMatchObject({ kind: 'deleted', userId: 'u3' });
  });

  it('looks authors missing from the members up and resolves them as left, pending meanwhile', async () => {
    let release: (summaries: unknown[]) => void = () => {};
    const { fake, result } = setup(['u1', 'gone', 'gone'], {
      summaries: () => new Promise((resolve) => (release = resolve)),
    });

    await waitFor(() => expect(result.current.resolve('u1').kind).toBe('member'));
    await waitFor(() => expect(fake.stubs.users.summaries).toHaveBeenCalledTimes(1));
    expect(result.current.resolve('gone').kind).toBe('pending');

    await act(async () => release([summary('gone', 'Gone Person')]));

    await waitFor(() => expect(result.current.resolve('gone').kind).toBe('left'));
    expect(result.current.resolve('gone')).toEqual({
      kind: 'left',
      userId: 'gone',
      identifier: 'gone/example.test',
      displayName: 'Gone Person',
      avatarUrl: null,
      role: null,
    });
    expect(fake.stubs.users.summaries).toHaveBeenCalledWith(['gone']);
    expect(fake.stubs.rooms.members).toHaveBeenCalledTimes(1);
  });

  it('resolves a missing author whose summary is empty as deleted', async () => {
    const { result } = setup(['gone']);

    await waitFor(() => expect(result.current.resolve('gone').kind).toBe('deleted'));
  });

  it('resolves a missing author as deleted when the lookup fails', async () => {
    const { result } = setup(['gone'], {
      summaries: async () => {
        throw new Error('boom');
      },
    });

    await waitFor(() => expect(result.current.resolve('gone').kind).toBe('deleted'));
  });

  it('does not look anyone up when every author is a member', async () => {
    const { fake, result } = setup(['u1']);

    await waitFor(() => expect(result.current.resolve('u1').kind).toBe('member'));

    expect(fake.stubs.users.summaries).not.toHaveBeenCalled();
  });
});
