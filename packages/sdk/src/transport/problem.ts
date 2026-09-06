/**
 * Single decode path from an HTTP error response to a typed {@link EkozError}.
 *
 * Whatever the endpoint, a non-2xx response goes through {@link decodeProblem}:
 * parse the `application/problem+json` body, map the stable `code` to an error
 * class, and fall back to a generic {@link EkozError} (keeping the raw `code`)
 * for anything unknown so the SDK does not break when the server adds a code.
 */

import {
  AccountSuspendedError,
  AuthenticationError,
  EkozError,
  EmailNotVerifiedError,
  EmailTakenError,
  InvalidCredentialsError,
  InvitationInvalidError,
  LastOwnerError,
  NetworkError,
  NotFoundError,
  type ProblemDetails,
  RateLimitError,
  RefreshInvalidError,
  RefreshReuseError,
  RegistrationClosedError,
  ServerError,
  UsernameChangeCooldownError,
  UsernameImmutableError,
  UsernameTakenError,
  ValidationError,
  type ValidationIssue,
  WeakPasswordError,
} from './errors.js';
import { resolveRequestId } from './request-context.js';

type EkozErrorClass = new (init: ConstructorParameters<typeof EkozError>[0]) => EkozError;

/** Stable `code` → error class. Anything not listed falls back by status. */
export const ERROR_CODE_MAP: Readonly<Record<string, EkozErrorClass>> = {
  validation_failed: ValidationError,
  'auth.unauthenticated': AuthenticationError,
  'auth.too_many_requests': RateLimitError,
  'auth.invalid_credentials': InvalidCredentialsError,
  'auth.refresh_invalid': RefreshInvalidError,
  'auth.refresh_reuse': RefreshReuseError,
  'identity.account_suspended': AccountSuspendedError,
  'identity.email_not_verified': EmailNotVerifiedError,
  'identity.username_taken': UsernameTakenError,
  'identity.registration_closed': RegistrationClosedError,
  'identity.invitation_invalid': InvitationInvalidError,
  'identity.email_taken': EmailTakenError,
  'identity.password_too_weak': WeakPasswordError,
  'identity.username_immutable': UsernameImmutableError,
  'identity.username_change_cooldown': UsernameChangeCooldownError,
  'identity.last_owner': LastOwnerError,
};

/** Parse `Retry-After` (delta-seconds or HTTP-date) into seconds from now. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.round((date - Date.now()) / 1000));
}

function fallbackClassForStatus(status: number): EkozErrorClass {
  if (status >= 500) return ServerError;
  if (status === 404) return NotFoundError;
  if (status === 429) return RateLimitError;
  if (status === 401) return AuthenticationError;
  return EkozError;
}

function extractIssues(body: ProblemDetails): ValidationIssue[] {
  const raw = body.errors;
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        const e = entry as Record<string, unknown>;
        return {
          path: typeof e.path === 'string' ? (e.path as string) : '',
          message: typeof e.message === 'string' ? (e.message as string) : '',
        };
      })
      .filter((i) => i.path !== '' || i.message !== '');
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).flatMap(([path, messages]) =>
      (Array.isArray(messages) ? messages : [messages]).map((m) => ({
        path,
        message: String(m),
      })),
    );
  }
  return [];
}

async function readProblemBody(response: Response): Promise<ProblemDetails> {
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === 'object') return parsed as ProblemDetails;
  } catch {
    // Non-JSON or empty error body: fall back to status-only mapping.
  }
  return {};
}

/**
 * Turn a non-2xx {@link Response} into the matching typed error.
 *
 * @param response  The failed response.
 * @param sentRequestId  The `X-Request-Id` the SDK sent, used when the server
 *   does not report one back.
 */
export async function decodeProblem(response: Response, sentRequestId: string): Promise<EkozError> {
  const body = await readProblemBody(response);
  const status = typeof body.status === 'number' ? body.status : response.status;
  const code = body.code ?? statusCode(status);
  const requestId = resolveRequestId(sentRequestId, response.headers, body.requestId);

  // Server-side failures must not leak internal detail to consumers.
  if (status >= 500) {
    return new ServerError({
      code: body.code ?? 'internal_error',
      status,
      title: body.title ?? 'Internal server error',
      requestId,
    });
  }

  const retryAfter =
    status === 429 ? parseRetryAfter(response.headers.get('retry-after')) : undefined;

  const init = {
    code,
    status,
    title: body.title,
    detail: body.detail,
    requestId,
    retryAfter,
  };

  const ErrorClass = ERROR_CODE_MAP[code] ?? fallbackClassForStatus(status);

  if (ErrorClass === ValidationError) {
    return new ValidationError({ ...init, issues: extractIssues(body) });
  }
  return new ErrorClass(init);
}

/** Wrap a thrown `fetch` failure (no response) as a {@link NetworkError}. */
export function toNetworkError(cause: unknown, requestId: string): NetworkError {
  const message = cause instanceof Error ? cause.message : 'network request failed';
  return new NetworkError({
    code: 'network_error',
    status: 0,
    title: 'Network request failed',
    detail: message,
    requestId,
  });
}

function statusCode(status: number): string {
  return `http_${status}`;
}
