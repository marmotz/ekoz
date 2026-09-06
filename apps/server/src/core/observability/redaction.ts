/**
 * Redaction path list applied to every `pino` logger (ADR 0020, technical.md
 * §11). New secret-bearing fields are added here as they appear.
 *
 * Paths use `fast-redact` syntax (pino's redaction engine): a `*` matches one
 * whole path segment. Message bodies and email contents are never passed to the
 * logger in the first place — redaction is the second line of defence.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'token',
  '*.token',
  'privateKey',
  '*.privateKey',
  'secret',
  '*.secret',
  'email.smtp.pass',
  'config.secret.key',
];

/** Replacement string pino writes in place of a redacted value. */
export const REDACT_CENSOR = '[Redacted]';
