import { DomainError } from '../http/domain-error.js';

/**
 * Problem+json errors for link previews (technical.md §S10). Codes are
 * namespaced `link_preview.*`.
 */

export class LinkPreviewDisabledError extends DomainError {
  constructor(detail = 'Link previews are disabled on this server.') {
    super('link_preview.disabled', detail, 404, 'Not Found');
  }
}

export class LinkPreviewUrlInvalidError extends DomainError {
  constructor(detail = 'This is not a valid http(s) URL.') {
    super('link_preview.url_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class LinkPreviewUrlNotInBodyError extends DomainError {
  constructor(detail = 'linkPreviewUrl must be one of the http(s) links in the body.') {
    super('link_preview.url_not_in_body', detail, 422, 'Unprocessable Entity');
  }
}

export class LinkPreviewTooManyRequestsError extends DomainError {
  constructor(
    retryAfterSeconds: number,
    detail = 'Too many link preview requests; slow down and retry later.',
  ) {
    super('link_preview.too_many_requests', detail, 429, 'Too Many Requests', {
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    });
  }
}
