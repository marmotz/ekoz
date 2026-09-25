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

export class RoomNotJoinableError extends DomainError {
  constructor(detail = 'This room cannot be joined directly; ask for an invitation.') {
    super('room.not_joinable', detail, 422, 'Unprocessable Entity');
  }
}

export class RoomAlreadyMemberError extends DomainError {
  constructor(detail = 'You are already a member of this room.') {
    super('room.already_member', detail, 409, 'Conflict');
  }
}

export class RoomBannedError extends DomainError {
  constructor(detail = 'You are banned from this room.') {
    super('room.banned', detail, 403, 'Forbidden');
  }
}

export class MembershipNotFoundError extends DomainError {
  constructor(detail = 'This user is not a member of this room.') {
    super('room.membership_not_found', detail, 404, 'Not Found');
  }
}

export class RoleAboveAuthorityError extends DomainError {
  constructor(detail = "This role is above the caller's own effective authority.") {
    super('room.role_above_authority', detail, 403, 'Forbidden');
  }
}

export class InvitationNotFoundError extends DomainError {
  constructor(detail = 'No such invitation.') {
    super('room.invitation_not_found', detail, 404, 'Not Found');
  }
}

export class InvitationAlreadyExistsError extends DomainError {
  constructor(detail = 'This user already has a pending invitation to this room.') {
    super('room.invitation_already_exists', detail, 409, 'Conflict');
  }
}

export class InvitationAlreadyResolvedError extends DomainError {
  constructor(detail = 'This invitation has already been accepted or declined.') {
    super('room.invitation_already_resolved', detail, 409, 'Conflict');
  }
}

export class JoinRequestNotFoundError extends DomainError {
  constructor(detail = 'No such join request.') {
    super('room.join_request_not_found', detail, 404, 'Not Found');
  }
}

export class JoinRequestAlreadyExistsError extends DomainError {
  constructor(detail = 'You already have a pending join request for this room.') {
    super('room.join_request_already_exists', detail, 409, 'Conflict');
  }
}

export class JoinRequestAlreadyResolvedError extends DomainError {
  constructor(detail = 'This join request has already been approved or rejected.') {
    super('room.join_request_already_resolved', detail, 409, 'Conflict');
  }
}

export class RoomReadOnlyError extends DomainError {
  constructor(detail = 'This room is read-only.') {
    super('room.read_only', detail, 422, 'Unprocessable Entity');
  }
}

export class MessageBodyInvalidError extends DomainError {
  constructor(detail: string) {
    super('message.body_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class MessageBodyTooLongError extends DomainError {
  constructor(detail = 'The message body exceeds the maximum length.') {
    super('message.body_too_long', detail, 422, 'Unprocessable Entity');
  }
}

export class MessageNotFoundError extends DomainError {
  constructor(detail = 'No such message.') {
    super('message.not_found', detail, 404, 'Not Found');
  }
}

export class MessageReplyNotInRoomError extends DomainError {
  constructor(detail = 'The message being replied to is not in this room.') {
    super('message.reply_not_in_room', detail, 422, 'Unprocessable Entity');
  }
}

export class MessageMentionNotMemberError extends DomainError {
  constructor(detail = 'A mentioned user is not resolvable in this room.') {
    super('message.mention_not_member', detail, 422, 'Unprocessable Entity');
  }
}

export class MessageMentionInvalidError extends DomainError {
  constructor(detail = 'A mention target is not valid in this room.') {
    super('message.mention_invalid', detail, 422, 'Unprocessable Entity');
  }
}

export class MessageAlreadyPinnedError extends DomainError {
  constructor(detail = 'This message is already pinned.') {
    super('message.already_pinned', detail, 409, 'Conflict');
  }
}

export class MessageNotPinnedError extends DomainError {
  constructor(detail = 'This message is not pinned.') {
    super('message.not_pinned', detail, 404, 'Not Found');
  }
}

export class DmSelfError extends DomainError {
  constructor(detail = 'Cannot start a direct conversation with yourself.') {
    super('room.dm_self', detail, 422, 'Unprocessable Entity');
  }
}

export class ReactionAlreadyExistsError extends DomainError {
  constructor(detail = 'You already reacted with this emoji.') {
    super('message.reaction_already_exists', detail, 409, 'Conflict');
  }
}

export class ReactionNotFoundError extends DomainError {
  constructor(detail = 'No such reaction from you on this message.') {
    super('message.reaction_not_found', detail, 404, 'Not Found');
  }
}

export class GroupNotFoundError extends DomainError {
  constructor(detail = 'No such group on this room or its ancestors.') {
    super('group.not_found', detail, 404, 'Not Found');
  }
}

export class GroupNameReservedError extends DomainError {
  constructor(detail = 'This group name is reserved.') {
    super('group.name_reserved', detail, 422, 'Unprocessable Entity');
  }
}

export class GroupNameTakenError extends DomainError {
  constructor(detail = 'A group with this name already exists on this room chain.') {
    super('group.name_taken', detail, 409, 'Conflict');
  }
}

export class GroupMemberNotMemberError extends DomainError {
  constructor(detail = 'A group member must be an effective member of the room.') {
    super('group.member_not_member', detail, 422, 'Unprocessable Entity');
  }
}
