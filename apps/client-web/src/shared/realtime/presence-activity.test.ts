import type { PresenceReporter } from '@ekozhq/sdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  HIDDEN_IDLE_MS,
  startPresenceActivity,
  VISIBLE_IDLE_MS,
} from '@/shared/realtime/presence-activity';
import { createFakeReporter } from '../../../test/sdk-mock';

let hidden = false;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
});
afterEach(() => {
  vi.useRealTimers();
});

function start() {
  const { reporter } = createFakeReporter();
  const stop = startPresenceActivity(reporter as unknown as PresenceReporter);
  return { reporter, stop };
}

function setHidden(value: boolean) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

it('starts the reporter and stops it on cleanup', () => {
  const { reporter, stop } = start();
  expect(reporter.start).toHaveBeenCalledTimes(1);

  stop();

  expect(reporter.stop).toHaveBeenCalledTimes(1);
});

it('goes idle after 5 minutes without input on a visible tab', () => {
  const { reporter, stop } = start();

  vi.advanceTimersByTime(VISIBLE_IDLE_MS - 1);
  expect(reporter.setIdle).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(reporter.setIdle).toHaveBeenLastCalledWith(true);

  stop();
});

it.each(['pointerdown', 'keydown', 'wheel'])(
  '%s makes the user active and restarts the countdown',
  (name) => {
    const { reporter, stop } = start();
    vi.advanceTimersByTime(VISIBLE_IDLE_MS - 1000);

    document.dispatchEvent(new Event(name));
    expect(reporter.setIdle).toHaveBeenLastCalledWith(false);

    vi.advanceTimersByTime(VISIBLE_IDLE_MS - 1000);
    expect(reporter.setIdle).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(1000);
    expect(reporter.setIdle).toHaveBeenLastCalledWith(true);

    stop();
  },
);

it('goes idle after a minute hidden, and not before', () => {
  const { reporter, stop } = start();

  setHidden(true);
  vi.advanceTimersByTime(HIDDEN_IDLE_MS - 1);
  expect(reporter.setIdle).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(reporter.setIdle).toHaveBeenLastCalledWith(true);

  stop();
});

it('does not count the visible-tab timer while hidden', () => {
  const { reporter, stop } = start();

  setHidden(true);
  vi.advanceTimersByTime(HIDDEN_IDLE_MS);
  reporter.setIdle.mockClear();
  vi.advanceTimersByTime(VISIBLE_IDLE_MS * 2);

  expect(reporter.setIdle).not.toHaveBeenCalled();

  stop();
});

it('a tab that becomes visible again is active, and cancels a pending idle', () => {
  const { reporter, stop } = start();

  setHidden(true);
  vi.advanceTimersByTime(HIDDEN_IDLE_MS - 1000);
  setHidden(false);
  expect(reporter.setIdle).toHaveBeenLastCalledWith(false);

  reporter.setIdle.mockClear();
  vi.advanceTimersByTime(VISIBLE_IDLE_MS - 1);
  expect(reporter.setIdle).not.toHaveBeenCalled();

  stop();
});

it('starts hidden when the tab is already hidden', () => {
  hidden = true;
  const { reporter, stop } = start();

  vi.advanceTimersByTime(HIDDEN_IDLE_MS);

  expect(reporter.setIdle).toHaveBeenLastCalledWith(true);

  stop();
});

it('stops listening and counting on cleanup', () => {
  const { reporter, stop } = start();
  stop();

  document.dispatchEvent(new Event('keydown'));
  vi.advanceTimersByTime(VISIBLE_IDLE_MS * 2);

  expect(reporter.setIdle).not.toHaveBeenCalled();
});
