/**
 * Typed error hierarchy for the Ekoz SDK.
 *
 * Every failed API call rejects with an {@link EkozError} (or a subclass). The
 * concrete class is derived from the stable, namespaced `code` carried by the
 * server's `application/problem+json` body (see ADR 0017); unknown codes fall
 * back to a generic {@link EkozError} that still exposes the raw `code`.
 */

/** Shape of an `application/problem+json` body as emitted by the server. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: unknown;
  requestId?: string;
}

/** A single field-level validation issue extracted from a `422` response. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export interface EkozErrorInit {
  /** Stable, namespaced error code (e.g. `auth.invalid_credentials`). */
  code: string;
  /** HTTP status code, or `0` when the request never reached the server. */
  status: number;
  title?: string;
  detail?: string;
  /** `X-Request-Id` for support correlation. */
  requestId?: string;
  /** Seconds to wait before retrying, parsed from `Retry-After` (429). */
  retryAfter?: number;
}

/** Base class for every error surfaced by the SDK. */
export class EkozError extends Error {
  readonly code: string;
  readonly status: number;
  readonly title: string | undefined;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;
  readonly retryAfter: number | undefined;

  constructor(init: EkozErrorInit) {
    super(init.detail ?? init.title ?? init.code);
    // Restore the prototype chain broken by transpiling `extends Error`.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.code = init.code;
    this.status = init.status;
    this.title = init.title;
    this.detail = init.detail;
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
  }
}

/** `422 validation_failed` — carries the per-field issues. */
export class ValidationError extends EkozError {
  readonly issues: ValidationIssue[];

  constructor(init: EkozErrorInit & { issues?: ValidationIssue[] }) {
    super(init);
    this.issues = init.issues ?? [];
  }
}

/** `404` — resource not found. */
export class NotFoundError extends EkozError {}

/** `429` — too many requests; see {@link EkozError.retryAfter}. */
export class RateLimitError extends EkozError {}

/** `401` — the request was not authenticated (missing/expired access token). */
export class AuthenticationError extends EkozError {}

/** `status >= 500` — server-side failure. Server `detail` is intentionally dropped. */
export class ServerError extends EkozError {}

/** The request never produced a response (DNS, connection, CORS, offline...). */
export class NetworkError extends EkozError {}

/**
 * The server does not advertise any protocol major this SDK supports. Raised
 * during discovery resolution, before any business call. Not tied to a server
 * `code`.
 */
export class ProtocolMismatchError extends EkozError {
  readonly supported: readonly string[];
  readonly advertised: readonly string[];

  constructor(init: {
    supported: readonly string[];
    advertised: readonly string[];
    requestId?: string;
  }) {
    super({
      code: 'protocol.mismatch',
      status: 0,
      title: 'Protocol version mismatch',
      detail: `SDK supports protocol major(s) [${init.supported.join(', ')}]; server advertises [${init.advertised.join(', ')}].`,
      requestId: init.requestId,
    });
    this.supported = init.supported;
    this.advertised = init.advertised;
  }
}

// --- Identity business errors (mapped from the stable `code`, see ADR 0017) ---

/** `auth.invalid_credentials` */
export class InvalidCredentialsError extends EkozError {}
/** `auth.refresh_invalid` */
export class RefreshInvalidError extends EkozError {}
/** `auth.refresh_reuse` — a consumed refresh token was replayed; session revoked. */
export class RefreshReuseError extends EkozError {}
/** `identity.account_suspended` */
export class AccountSuspendedError extends EkozError {}
/** `identity.email_not_verified` */
export class EmailNotVerifiedError extends EkozError {}
/** `identity.username_taken` */
export class UsernameTakenError extends EkozError {}
/** `identity.registration_closed` */
export class RegistrationClosedError extends EkozError {}
/** `identity.invitation_invalid` */
export class InvitationInvalidError extends EkozError {}
/** `identity.email_taken` */
export class EmailTakenError extends EkozError {}
/** `identity.password_too_weak` */
export class WeakPasswordError extends EkozError {}
/** `identity.username_immutable` */
export class UsernameImmutableError extends EkozError {}
/** `identity.username_change_cooldown` */
export class UsernameChangeCooldownError extends EkozError {}
/** `identity.last_owner` */
export class LastOwnerError extends EkozError {}
