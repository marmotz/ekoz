/**
 * Per-request correlation id handling.
 *
 * Every outbound request carries an `X-Request-Id` (ADR 0017). The SDK generates
 * one unless the caller supplies it, and echoes it back onto errors so support
 * can correlate a client-side failure with a server log line.
 */

export const REQUEST_ID_HEADER = "X-Request-Id";

/** Generate a fresh request id (UUID v4). */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Resolve the request id to correlate an error with: the one the server reported
 * in the problem body or the `X-Request-Id` response header, otherwise the id
 * the SDK sent with the request.
 */
export function resolveRequestId(
  sent: string,
  responseHeaders?: Headers,
  problemRequestId?: string,
): string {
  return (
    problemRequestId ??
    responseHeaders?.get(REQUEST_ID_HEADER) ??
    sent
  );
}
