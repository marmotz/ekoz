/**
 * Session persistence contract (technical.md §8).
 *
 * The SDK never assumes an environment: consumers plug in whatever storage
 * fits (`localStorage` in a browser, a file or nothing in Node/Bun). The
 * access token itself is never persisted — only what is needed to resume a
 * session (the refresh token and its identity) survives a reload.
 */

export interface SessionState {
  refreshToken: string;
  sessionId: string;
  identifier: string | null;
}

export interface SessionStore {
  load(): SessionState | null | Promise<SessionState | null>;
  save(state: SessionState): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** In-memory default store; state does not survive process restart. */
export function memoryStore(): SessionStore {
  let state: SessionState | null = null;

  return {
    load: () => state,
    save: (next) => {
      state = next;
    },
    clear: () => {
      state = null;
    },
  };
}
