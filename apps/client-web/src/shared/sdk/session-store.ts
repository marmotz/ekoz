import type { SessionState, SessionStore } from '@ekozhq/sdk';

export const SESSION_STORAGE_KEY = 'ekoz.session';

function isSessionState(value: unknown): value is SessionState {
  if (typeof value !== 'object' || value === null) return false;
  const { refreshToken, sessionId, identifier } = value as Record<string, unknown>;
  return (
    typeof refreshToken === 'string' &&
    typeof sessionId === 'string' &&
    (typeof identifier === 'string' || identifier === null)
  );
}

/**
 * Persists the session (refresh token and identity, never the access token) in
 * `localStorage`. Tolerates an unavailable storage and corrupted content: both
 * read as "no session".
 */
export function localStorageSessionStore(): SessionStore {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (raw === null) return null;
        const parsed: unknown = JSON.parse(raw);
        return isSessionState(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage unavailable: the session just will not survive a reload.
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Nothing persisted, nothing to clear.
      }
    },
  };
}
