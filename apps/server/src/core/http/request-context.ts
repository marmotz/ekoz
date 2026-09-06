import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request (or per-job) ambient store, propagated through
 * `AsyncLocalStorage` (ADR 0017, technical.md §10).
 *
 * `requestId` is echoed in the `X-Request-Id` response header and included in
 * every log line. `userId` / `sessionId` are filled later by `AuthGuard`
 * (identity feature); `jobId` is set instead for background work.
 */
export interface RequestContext {
  /** Correlation id: accepted from `X-Request-Id`, otherwise generated. */
  readonly requestId: string;
  /** Client IP as seen by the server. */
  readonly clientIp?: string;
  /** Set once the request is authenticated. */
  userId?: string;
  /** Set once the request is authenticated. */
  sessionId?: string;
  /** Set for background jobs instead of `requestId` semantics. */
  readonly jobId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with `context` as the ambient request context. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The current ambient context, or `undefined` outside any request / job. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The current `requestId` (or `jobId`), or `undefined` when there is no context. */
export function getRequestId(): string | undefined {
  const ctx = storage.getStore();

  return ctx?.jobId ?? ctx?.requestId;
}

/**
 * Attach the authenticated principal to the current context. Called by
 * `AuthGuard` once identity lands; no-op when there is no ambient context.
 */
export function setAuthenticatedPrincipal(principal: { userId: string; sessionId?: string }): void {
  const ctx = storage.getStore();
  if (!ctx) {
    return;
  }

  ctx.userId = principal.userId;
  ctx.sessionId = principal.sessionId;
}
