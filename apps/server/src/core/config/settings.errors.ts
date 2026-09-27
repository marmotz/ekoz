import { DomainError } from '../http/domain-error.js';

/**
 * Problem+json errors for `GET/PUT/DELETE /admin/settings` (technical.md §2,
 * issue #145). Codes are namespaced `config.*`.
 */

export class ConfigUnknownKeyError extends DomainError {
  constructor(key: string) {
    super('config.unknown_key', `Unknown configuration key: ${key}`, 422, 'Unprocessable Entity');
  }
}

export class ConfigNotRuntimeError extends DomainError {
  constructor(key: string) {
    super(
      'config.not_runtime',
      `"${key}" is an infra parameter and cannot be set from the admin.`,
      409,
      'Conflict',
    );
  }
}

export class ConfigLockedError extends DomainError {
  constructor(key: string) {
    super('config.locked', `"${key}" is locked by an environment override.`, 409, 'Conflict');
  }
}
