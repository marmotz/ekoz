import { DomainError } from '../http/domain-error.js';

/**
 * Problem+json errors for the admin storage endpoints (technical.md §S11,
 * issue #146). Codes are namespaced `storage.*`.
 */

export class StorageUserNotFoundError extends DomainError {
  constructor(detail = 'No such user.') {
    super('storage.user_not_found', detail, 404, 'Not Found');
  }
}

export class StorageBlobNotFoundError extends DomainError {
  constructor(detail = 'No such blob.') {
    super('storage.blob_not_found', detail, 404, 'Not Found');
  }
}
