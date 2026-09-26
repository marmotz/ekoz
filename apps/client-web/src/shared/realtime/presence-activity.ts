import type { PresenceReporter } from '@ekozhq/sdk';

/** A tab hidden for this long is idle. */
export const HIDDEN_IDLE_MS = 60_000;
/** A visible tab with no input for this long is idle. */
export const VISIBLE_IDLE_MS = 5 * 60_000;

const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

/**
 * Runs `reporter` for as long as the returned cleanup has not been called, and
 * tells it when the user is idle: a tab hidden for {@link HIDDEN_IDLE_MS}, or a
 * visible tab with no `pointerdown` / `keydown` / `wheel` for
 * {@link VISIBLE_IDLE_MS}. Any input, or the tab becoming visible, makes the
 * user active again (web-client-presence-and-typing technical design C1).
 */
export function startPresenceActivity(reporter: PresenceReporter): () => void {
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  let inputTimer: ReturnType<typeof setTimeout> | undefined;

  const armInputTimer = () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => reporter.setIdle(true), VISIBLE_IDLE_MS);
  };

  const onInput = () => {
    reporter.setIdle(false);
    armInputTimer();
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      clearTimeout(inputTimer);
      clearTimeout(hiddenTimer);
      hiddenTimer = setTimeout(() => reporter.setIdle(true), HIDDEN_IDLE_MS);
    } else {
      clearTimeout(hiddenTimer);
      reporter.setIdle(false);
      armInputTimer();
    }
  };

  for (const name of INPUT_EVENTS) document.addEventListener(name, onInput, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  reporter.start();
  if (document.hidden) onVisibilityChange();
  else armInputTimer();

  return () => {
    for (const name of INPUT_EVENTS) document.removeEventListener(name, onInput);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    clearTimeout(hiddenTimer);
    clearTimeout(inputTimer);
    reporter.stop();
  };
}
