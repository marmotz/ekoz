/**
 * Token lifecycle and single-flight refresh orchestration (technical.md §7).
 *
 * Owns the in-memory session state (`accessToken` never persisted — it is
 * short-lived and re-minted from the refresh token) and is the only piece of
 * the SDK allowed to call `POST /auth/refresh` / `POST /auth/logout`. Resource
 * bindings route every authenticated call through {@link SessionManager.request}
 * so a single, shared refresh happens under concurrent 401s.
 */

import {
  AccountSuspendedError,
  AuthenticationError,
  RefreshReuseError,
} from '../transport/errors.js';
import type { HttpClient, HttpMethod, RequestOptions } from '../transport/http-client.js';
import { type SessionEventEmitter, type SessionInvalidReason } from './events.js';
import { memoryStore, type SessionState, type SessionStore } from './session-store.js';

/** Normalised shape of a login / setup-owner response, before session state. */
export interface AuthBundle {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime, seconds. */
  expiresIn: number;
  sessionId: string;
  identifier: string | null;
}

interface InternalState {
  accessToken: string | undefined;
  /** Epoch ms; `0` means no access token has been minted yet (cold resume). */
  accessExpiresAt: number;
  refreshToken: string;
  sessionId: string;
  identifier: string | null;
}

export interface SessionManagerOptions {
  httpClient: HttpClient;
  emitter: SessionEventEmitter;
  store?: SessionStore;
}

function toStoreState(state: InternalState): SessionState {
  return {
    refreshToken: state.refreshToken,
    sessionId: state.sessionId,
    identifier: state.identifier,
  };
}

export class SessionManager {
  readonly #http: HttpClient;
  readonly #emitter: SessionEventEmitter;
  readonly #store: SessionStore;

  #state: InternalState | undefined;
  #refreshPromise: Promise<void> | undefined;
  #mountPromise: Promise<void> | undefined;

  constructor(options: SessionManagerOptions) {
    this.#http = options.httpClient;
    this.#emitter = options.emitter;
    this.#store = options.store ?? memoryStore();
  }

  get accessToken(): string | undefined {
    return this.#state?.accessToken;
  }

  /** Public, non-sensitive view of the current session (no tokens). */
  getState(): { identifier: string | null; sessionId: string } | undefined {
    if (!this.#state) return undefined;
    return { identifier: this.#state.identifier, sessionId: this.#state.sessionId };
  }

  /** Inject `Authorization: Bearer` when a session is active; passes through otherwise. */
  attachAuth(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!this.#state?.accessToken) return headers;
    return { ...headers, Authorization: `Bearer ${this.#state.accessToken}` };
  }

  /** Establish a session from a login / setup-owner response. */
  async establish(bundle: AuthBundle): Promise<void> {
    this.#state = {
      accessToken: bundle.accessToken,
      accessExpiresAt: Date.now() + bundle.expiresIn * 1000,
      refreshToken: bundle.refreshToken,
      sessionId: bundle.sessionId,
      identifier: bundle.identifier,
    };
    await this.#store.save(toStoreState(this.#state));
    this.#emitter.emit('session:authenticated', {
      identifier: bundle.identifier,
      sessionId: bundle.sessionId,
    });
  }

  /**
   * Authenticated request wrapper: proactively refreshes an expired access
   * token, and reactively refreshes + replays once on `auth.unauthenticated`.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    await this.#mount();
    await this.#refreshIfExpired();

    try {
      return await this.#http.request<T>(method, path, this.#withAuth(options));
    } catch (error) {
      if (this.#isAccountSuspended(error)) {
        this.#emitter.emit('session:invalid', { reason: 'account_suspended' });
        throw error;
      }
      if (this.#isUnauthenticated(error) && this.#state?.refreshToken) {
        await this.#refresh();
        return await this.#http.request<T>(method, path, this.#withAuth(options));
      }
      throw error;
    }
  }

  /** `POST /auth/logout`, then clear local state regardless of the network outcome. */
  async logout(): Promise<void> {
    try {
      if (this.#state?.accessToken) {
        await this.#http.request('POST', '/auth/logout', { headers: this.#withAuth().headers });
      }
    } catch {
      // Local state is cleared unconditionally below.
    } finally {
      await this.#invalidate('logout');
    }
  }

  /** Explicit local-only teardown (e.g. after account deletion). */
  async clear(): Promise<void> {
    this.#state = undefined;
    await this.#store.clear();
    this.#emitter.emit('session:cleared', {});
  }

  /**
   * Explicitly mount from the store (if not already) and force a refresh. A
   * failure emits `session:invalid` and leaves the client unauthenticated —
   * never throws. The same cold mount otherwise happens lazily on the first
   * authenticated call, via {@link request}.
   */
  async resume(): Promise<void> {
    await this.#mount();
    if (!this.#state?.refreshToken) return;

    try {
      await this.#refresh();
    } catch {
      // Already invalidated + emitted inside #refresh.
    }
  }

  /** Load persisted state (if any) into memory, cold — no network call. */
  #mount(): Promise<void> {
    this.#mountPromise ??= this.#doMount();
    return this.#mountPromise;
  }

  async #doMount(): Promise<void> {
    if (this.#state) return;
    const stored = await this.#store.load();
    if (!stored || this.#state) return;

    this.#state = {
      accessToken: undefined,
      accessExpiresAt: 0,
      refreshToken: stored.refreshToken,
      sessionId: stored.sessionId,
      identifier: stored.identifier,
    };
  }

  async #refreshIfExpired(): Promise<void> {
    if (this.#state && this.#state.accessExpiresAt <= Date.now() && this.#state.refreshToken) {
      try {
        await this.#refresh();
      } catch {
        // Surfaces as a plain unauthenticated failure on the call that follows.
      }
    }
  }

  /** Single-flight refresh: concurrent callers share the same in-flight promise. */
  #refresh(): Promise<void> {
    this.#refreshPromise ??= this.#doRefresh().finally(() => {
      this.#refreshPromise = undefined;
    });
    return this.#refreshPromise;
  }

  async #doRefresh(): Promise<void> {
    const refreshToken = this.#state?.refreshToken;
    if (!refreshToken) return;

    try {
      const bundle = await this.#http.request<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>('POST', '/auth/refresh', { body: { refreshToken } });

      this.#state = {
        accessToken: bundle.accessToken,
        accessExpiresAt: Date.now() + bundle.expiresIn * 1000,
        refreshToken: bundle.refreshToken,
        sessionId: this.#state?.sessionId ?? '',
        identifier: this.#state?.identifier ?? null,
      };
      await this.#store.save(toStoreState(this.#state));
      this.#emitter.emit('session:refreshed', { sessionId: this.#state.sessionId });
    } catch (error) {
      const reason: SessionInvalidReason =
        error instanceof RefreshReuseError ? 'refresh_reuse' : 'refresh_failed';
      await this.#invalidate(reason);
      throw error;
    }
  }

  async #invalidate(reason: SessionInvalidReason): Promise<void> {
    this.#state = undefined;
    await this.#store.clear();
    this.#emitter.emit('session:invalid', { reason });
    this.#emitter.emit('session:cleared', {});
  }

  #withAuth(options: RequestOptions = {}): RequestOptions {
    return { ...options, headers: this.attachAuth(options.headers) };
  }

  #isUnauthenticated(error: unknown): boolean {
    return error instanceof AuthenticationError && error.code === 'auth.unauthenticated';
  }

  #isAccountSuspended(error: unknown): boolean {
    return error instanceof AccountSuspendedError;
  }
}

export type { SessionState, SessionStore } from './session-store.js';
