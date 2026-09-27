import { DomainError } from '../http/domain-error.js';

/**
 * Problem+json errors for uploads and quotas (technical.md §S8). Codes are
 * namespaced `upload.*`.
 */

export class UploadTooLargeError extends DomainError {
  constructor(detail = 'The upload exceeds the maximum allowed file size.') {
    super('upload.too_large', detail, 413, 'Payload Too Large');
  }
}

export class QuotaExceededError extends DomainError {
  constructor(usedBytes: bigint, quotaBytes: bigint) {
    super(
      'upload.quota_exceeded',
      'This would exceed the storage quota.',
      403,
      'Forbidden',
      undefined,
      { usedBytes: usedBytes.toString(), quotaBytes: quotaBytes.toString() },
    );
  }
}

export class CapacityExceededError extends DomainError {
  constructor(detail = 'The server has reached its storage capacity.') {
    super('upload.capacity_exceeded', detail, 507, 'Insufficient Storage');
  }
}

export class UploadTypeRejectedError extends DomainError {
  constructor(detail = 'The uploaded content type is not accepted.') {
    super('upload.type_rejected', detail, 422, 'Unprocessable Entity');
  }
}

export class UploadOffsetMismatchError extends DomainError {
  constructor(detail = 'The Upload-Offset header does not match the upload state.') {
    super('upload.offset_mismatch', detail, 409, 'Conflict');
  }
}

export class UploadNotFoundError extends DomainError {
  constructor(detail = 'No such upload.') {
    super('upload.not_found', detail, 404, 'Not Found');
  }
}

export class UploadExpiredError extends DomainError {
  constructor(detail = 'This upload has expired.') {
    super('upload.expired', detail, 410, 'Gone');
  }
}

export class UploadNotReadyError extends DomainError {
  constructor(detail = 'This upload has not finished yet.') {
    super('upload.not_ready', detail, 409, 'Conflict');
  }
}

export class UploadRequestInvalidError extends DomainError {
  constructor(detail: string) {
    super('upload.request_invalid', detail, 400, 'Bad Request');
  }
}

/** Problem+json error for signed file URLs (technical.md §S6). */
export class FileNotFoundError extends DomainError {
  constructor(detail = 'No such file, or you no longer have access to it.') {
    super('files.not_found', detail, 404, 'Not Found');
  }
}
