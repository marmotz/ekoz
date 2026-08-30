/**
 * `application/problem+json` body (RFC 9457), the single error shape for the
 * whole REST surface (ADR 0017, technical.md §10).
 *
 * `code` is the stable, machine-readable string the SDK surfaces as a typed
 * error; it is namespaced by domain (e.g. `identity.username_taken`).
 */
export interface ProblemDetails {
  /** URI reference identifying the problem type. `about:blank` when unspecified. */
  type: string;
  /** Short, human-readable summary, in English. */
  title: string;
  /** HTTP status code, repeated in the body per RFC 9457. */
  status: number;
  /** Human-readable explanation specific to this occurrence. */
  detail: string;
  /** Stable machine-readable error code, namespaced by domain. */
  code: string;
  /** Per-field validation issues, present only for `validation_failed`. */
  errors?: ValidationIssue[];
  /** Correlation id, echoed from / generated for the request. */
  requestId?: string;
}

export interface ValidationIssue {
  /** Dotted path to the offending field, e.g. `body.email`. */
  path: string;
  /** Human-readable message for this issue. */
  message: string;
}

export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';
