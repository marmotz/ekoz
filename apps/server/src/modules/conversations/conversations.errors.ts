import { DomainError } from '../../core/http/domain-error.js';

/**
 * Problem+json errors for the conversations feature (technical.md). Codes are
 * namespaced `room.*`.
 */

export class RoomNotFoundError extends DomainError {
  constructor(detail = 'No such room.') {
    super('room.not_found', detail, 404, 'Not Found');
  }
}

export class RoomParentNotFoundError extends DomainError {
  constructor(detail = 'The parent room does not exist.') {
    super('room.parent_not_found', detail, 422, 'Unprocessable Entity');
  }
}

export class RoomInvalidParentTypeError extends DomainError {
  constructor(detail = 'A channel must be attached to a space.') {
    super('room.invalid_parent_type', detail, 422, 'Unprocessable Entity');
  }
}

export class RoomCycleError extends DomainError {
  constructor(detail = 'Moving this room here would create a cycle.') {
    super('room.cycle', detail, 422, 'Unprocessable Entity');
  }
}

export class RoomMaxDepthExceededError extends DomainError {
  constructor(detail = 'This move would exceed the maximum room nesting depth.') {
    super('room.max_depth_exceeded', detail, 422, 'Unprocessable Entity');
  }
}

export class RoomNotEmptyError extends DomainError {
  constructor(detail = 'This room still has children; delete or move them first.') {
    super('room.not_empty', detail, 409, 'Conflict');
  }
}

export class RoomPermissionDeniedError extends DomainError {
  constructor(detail = 'You do not have the required capability for this action.') {
    super('room.permission_denied', detail, 403, 'Forbidden');
  }
}
