import type { SessionState, SessionStore } from '@ekozhq/sdk';

const STORAGE_KEY = 'ekoz.admin.session';

function isSessionState(value: unknown): value is SessionState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.sessionId === 'string' &&
    (candidate.identifier === null || typeof candidate.identifier === 'string')
  );
}

export function localStorageSessionStore(): SessionStore {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return isSessionState(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(state) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage unavailable (private browsing, quota) — session simply won't survive a reload.
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
    },
  };
}
