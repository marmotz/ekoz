import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { READ_MARKER_DEBOUNCE_MS, useReadMarker } from '@/features/chat/hooks/use-read-marker';
import type { Timeline, TimelineMessage } from '@/features/chat/lib/timeline';
import { getReadingRoom, resetActiveRooms } from '@/shared/realtime/active-room';
import { SdkContext } from '@/shared/sdk/use-sdk';
import { createFakeSdk } from '../../../../test/sdk-mock';

function message(seq: number): TimelineMessage {
  return {
    id: `m${seq}`,
    roomId: 'r1',
    seq: String(seq),
    authorId: 'u1',
    body: `message ${seq}`,
    replyToId: null,
    mentions: [],
    mentionsMe: null,
    editedAt: null,
    redactedAt: null,
    hiddenAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    reactions: [],
    attachments: [],
    linkPreview: null,
  };
}

function timeline(seqs: number[], lastSeq = String(Math.max(...seqs))): Timeline {
  return {
    messages: seqs.map(message),
    hasMoreOlder: false,
    hasMoreNewer: false,
    lastSeq,
    pending: [],
  };
}

interface Props {
  roomId: string;
  timeline: Timeline | undefined;
  atBottom: boolean;
}

function setup(initial: Props) {
  const fake = createFakeSdk();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SdkContext.Provider value={fake.sdk}>{children}</SdkContext.Provider>
  );
  const hook = renderHook(
    (props: Props) => useReadMarker(props.roomId, props.timeline, props.atBottom),
    {
      wrapper,
      initialProps: initial,
    },
  );
  return { fake, set: fake.stubs.receipts.set, ...hook };
}

function windowState(visible: boolean, focused: boolean) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visible ? 'visible' : 'hidden');
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused);
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  windowState(true, true);
  resetActiveRooms();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('sends the newest message seq once after a quiet second', async () => {
  const { set } = setup({ roomId: 'r1', timeline: timeline([1, 2, 3]), atBottom: true });

  await advance(READ_MARKER_DEBOUNCE_MS - 1);
  expect(set).not.toHaveBeenCalled();

  await advance(1);
  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith('r1', '3');
});

it('publishes the reading room while reading and clears it otherwise', () => {
  const { rerender } = setup({ roomId: 'r1', timeline: timeline([1]), atBottom: true });
  expect(getReadingRoom()).toBe('r1');

  rerender({ roomId: 'r1', timeline: timeline([1]), atBottom: false });
  expect(getReadingRoom()).toBeNull();
});

it('sends nothing while scrolled up', async () => {
  const { set } = setup({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: false });

  await advance(READ_MARKER_DEBOUNCE_MS * 3);

  expect(set).not.toHaveBeenCalled();
});

it('sends nothing while the window is not focused', async () => {
  windowState(true, false);
  const { set } = setup({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });

  await advance(READ_MARKER_DEBOUNCE_MS * 3);

  expect(set).not.toHaveBeenCalled();
  expect(getReadingRoom()).toBeNull();
});

it('sends nothing before the timeline is loaded', async () => {
  const { set } = setup({ roomId: 'r1', timeline: undefined, atBottom: true });

  await advance(READ_MARKER_DEBOUNCE_MS * 3);

  expect(set).not.toHaveBeenCalled();
  expect(getReadingRoom()).toBeNull();
});

it('sends nothing for a room without messages', async () => {
  const empty: Timeline = { ...timeline([1]), messages: [], lastSeq: '0' };
  const { set } = setup({ roomId: 'r1', timeline: empty, atBottom: true });

  await advance(READ_MARKER_DEBOUNCE_MS * 3);

  expect(set).not.toHaveBeenCalled();
});

it('sends one marker per quiet window when messages keep arriving', async () => {
  const { set, rerender } = setup({ roomId: 'r1', timeline: timeline([1]), atBottom: true });

  await advance(600);
  rerender({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });
  await advance(600);
  rerender({ roomId: 'r1', timeline: timeline([1, 2, 3]), atBottom: true });
  await advance(READ_MARKER_DEBOUNCE_MS);

  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith('r1', '3');
});

it('never sends the same seq twice', async () => {
  const { set, rerender } = setup({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });
  await advance(READ_MARKER_DEBOUNCE_MS);
  expect(set).toHaveBeenCalledTimes(1);

  rerender({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: false });
  rerender({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });
  await advance(READ_MARKER_DEBOUNCE_MS * 2);

  expect(set).toHaveBeenCalledTimes(1);
});

it('targets the newest message seq, not the timeline lastSeq', async () => {
  const { set, rerender } = setup({
    roomId: 'r1',
    timeline: timeline([1, 2], '2'),
    atBottom: true,
  });
  await advance(READ_MARKER_DEBOUNCE_MS);
  expect(set).toHaveBeenLastCalledWith('r1', '2');

  // The receipt_updated caused by our own PUT advances lastSeq without adding a message.
  rerender({ roomId: 'r1', timeline: timeline([1, 2], '3'), atBottom: true });
  await advance(READ_MARKER_DEBOUNCE_MS * 2);

  expect(set).toHaveBeenCalledTimes(1);
});

it('flushes a pending send on unmount', async () => {
  const { set, unmount } = setup({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });
  await advance(200);
  expect(set).not.toHaveBeenCalled();

  unmount();

  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith('r1', '2');
  expect(getReadingRoom()).toBeNull();
});

it('flushes a pending send when the window is hidden', async () => {
  const { set } = setup({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });
  await advance(200);

  act(() => {
    windowState(false, false);
    document.dispatchEvent(new Event('visibilitychange'));
  });

  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith('r1', '2');
});

it('flushes for the old room when the room changes', async () => {
  const { set, rerender } = setup({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });
  await advance(200);

  rerender({ roomId: 'r2', timeline: undefined, atBottom: false });

  expect(set).toHaveBeenCalledWith('r1', '2');
});

it('swallows a failure and sends again on the next change', async () => {
  const { set, rerender } = setup({ roomId: 'r1', timeline: timeline([1]), atBottom: true });
  set.mockRejectedValueOnce(new Error('offline'));

  await advance(READ_MARKER_DEBOUNCE_MS);
  expect(set).toHaveBeenCalledTimes(1);

  rerender({ roomId: 'r1', timeline: timeline([1, 2]), atBottom: true });
  await advance(READ_MARKER_DEBOUNCE_MS);

  expect(set).toHaveBeenCalledTimes(2);
  expect(set).toHaveBeenLastCalledWith('r1', '2');
});

it('retries the same seq after a failure once reading resumes', async () => {
  const { set, rerender } = setup({ roomId: 'r1', timeline: timeline([1]), atBottom: true });
  set.mockRejectedValueOnce(new Error('offline'));
  await advance(READ_MARKER_DEBOUNCE_MS);

  rerender({ roomId: 'r1', timeline: timeline([1]), atBottom: false });
  rerender({ roomId: 'r1', timeline: timeline([1]), atBottom: true });
  await advance(READ_MARKER_DEBOUNCE_MS);

  expect(set).toHaveBeenCalledTimes(2);
  expect(set).toHaveBeenLastCalledWith('r1', '1');
});
