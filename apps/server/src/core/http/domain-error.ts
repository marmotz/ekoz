import type { ValidationIssue } from './problem-details.js';

/**
 * Base class for every expected, domain-level error. Carries a stable `code`
 * (namespaced by domain, e.g. `identity.username_taken`) and the HTTP status it
 * maps to. The global exception filter renders it as `application/problem+json`
 * (ADR 0017, technical.md §10).
 *
 * Throw subclasses of this from services; never throw raw `HttpException` for
 * domain conditions.
 */
export class DomainError extends Error {
  constructor(
    /** Stable machine-readable code, namespaced by domain. */
    readonly code: string,
    /** Human-readable explanation, in English. */
    readonly detail: string,
    /** HTTP status this error maps to. Defaults to `400`. */
    readonly status: number = 400,
    /** Short human-readable summary; defaults to a title derived from the status. */
    readonly title?: string,
    /** Extra response headers to set alongside the problem body (e.g. `Retry-After`). */
    readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(detail);

    this.name = new.target.name;
  }
}

/**
 * Raised when input fails validation at the edge. Always maps to `422` with
 * `code = "validation_failed"` and an `errors` array (ADR 0017).
 */
export class ValidationFailedError extends DomainError {
  constructor(readonly issues: ValidationIssue[]) {
    super(
      'validation_failed',
      'The request payload failed validation.',
      422,
      'Unprocessable Entity',
    );
  }
}
