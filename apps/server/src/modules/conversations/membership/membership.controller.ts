import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import {
  type BanMember,
  BanMemberDto,
  type ChangeRole,
  ChangeRoleDto,
  InvitationIdParamSchema,
  type InviteMember,
  InviteMemberDto,
  JoinRequestParamSchema,
  type ListJoinRequestsQuery,
  ListJoinRequestsQueryDto,
  type ListMembersQuery,
  ListMembersQueryDto,
  RoomMemberParamSchema,
} from './membership.dto.js';
import { MembershipService } from './membership.service.js';
import {
  type JoinRequestView,
  JoinRequestViewDto,
  type MemberListView,
  MemberListViewDto,
  type MembershipView,
  MembershipViewDto,
  type MyRoomInvitationListView,
  MyRoomInvitationListViewDto,
  type PendingJoinRequestListView,
  PendingJoinRequestListViewDto,
  type RoomInvitationView,
  RoomInvitationViewDto,
} from './membership.view.js';

@ApiTags('Conversations — membership')
@ApiBearerAuth('bearer')
@Controller('me/room-invitations')
@UseGuards(AuthGuard)
export class MyRoomInvitationsController {
  constructor(private readonly membership: MembershipService) {}

  @Get()
  @ApiOperation({ summary: 'Pending room invitations of the caller, newest first.' })
  @ApiOkResponse({ type: MyRoomInvitationListViewDto })
  @ApiProblemResponses()
  list(@CurrentPrincipal() principal: AuthPrincipal): Promise<MyRoomInvitationListView> {
    return this.membership.listMyInvitations(principal);
  }
}

@ApiTags('Conversations — membership')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class MembershipController {
  constructor(
    private readonly membership: MembershipService,
    private readonly moderation: ModerationService,
  ) {}

  @Get('rooms/:id/members')
  @ApiOperation({
    summary: 'List the effective members of a room, ancestor spaces included (needs room.read).',
  })
  @ApiOkResponse({ type: MemberListViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  listMembers(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Query(new ZodValidationPipe(ListMembersQueryDto)) query: ListMembersQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MemberListView> {
    return this.membership.listMembers(principal, params.id, query);
  }

  @Post('rooms/:id/join')
  @ApiOperation({ summary: 'Join a public room.' })
  @ApiCreatedResponse({ type: MembershipViewDto })
  @ApiProblemResponses({ statuses: [403, 404, 409, 422] })
  join(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MembershipView> {
    return this.membership.join(principal, params.id);
  }

  @Post('rooms/:id/leave')
  @HttpCode(204)
  @ApiOperation({ summary: 'Leave a room.' })
  @ApiProblemResponses({ statuses: [404] })
  async leave(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.membership.leave(principal, params.id);
  }

  @Post('rooms/:id/invitations')
  @ApiOperation({ summary: 'Invite a user to a room (needs room.invite).' })
  @ApiCreatedResponse({ type: RoomInvitationViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 409] })
  invite(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(InviteMemberDto)) body: InviteMember,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomInvitationView> {
    return this.membership.invite(principal, params.id, body);
  }

  @Post('invitations/:id/accept')
  @ApiOperation({ summary: 'Accept a pending invitation.' })
  @ApiOkResponse({ type: MembershipViewDto })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  acceptInvitation(
    @Param(new ZodValidationPipe(InvitationIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MembershipView> {
    return this.membership.acceptInvitation(principal, params.id);
  }

  @Post('invitations/:id/decline')
  @HttpCode(204)
  @ApiOperation({ summary: 'Decline a pending invitation.' })
  @ApiProblemResponses({ statuses: [404, 409] })
  async declineInvitation(
    @Param(new ZodValidationPipe(InvitationIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.membership.declineInvitation(principal, params.id);
  }

  @Post('rooms/:id/join-request')
  @ApiOperation({ summary: 'Request to join an invite-only room.' })
  @ApiCreatedResponse({ type: JoinRequestViewDto })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  createJoinRequest(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<JoinRequestView> {
    return this.membership.createJoinRequest(principal, params.id);
  }

  @Get('rooms/:id/join-requests')
  @ApiOperation({
    summary: 'List the pending join requests of a room, oldest first (needs room.manage_members).',
  })
  @ApiOkResponse({ type: PendingJoinRequestListViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  listJoinRequests(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Query(new ZodValidationPipe(ListJoinRequestsQueryDto)) query: ListJoinRequestsQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<PendingJoinRequestListView> {
    return this.membership.listJoinRequests(principal, params.id, query);
  }

  @Post('rooms/:id/join-requests/:requestId/approve')
  @ApiOperation({ summary: 'Approve a pending join request (needs room.manage_members).' })
  @ApiOkResponse({ type: MembershipViewDto })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  approveJoinRequest(
    @Param(new ZodValidationPipe(JoinRequestParamSchema)) params: { id: string; requestId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MembershipView> {
    return this.membership.approveJoinRequest(principal, params.id, params.requestId);
  }

  @Post('rooms/:id/join-requests/:requestId/reject')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reject a pending join request (needs room.manage_members).' })
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  async rejectJoinRequest(
    @Param(new ZodValidationPipe(JoinRequestParamSchema)) params: { id: string; requestId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.membership.rejectJoinRequest(principal, params.id, params.requestId);
  }

  @Delete('rooms/:id/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Kick a member out of a room (needs room.kick).' })
  @ApiProblemResponses({ statuses: [403, 404] })
  async kick(
    @Param(new ZodValidationPipe(RoomMemberParamSchema)) params: { id: string; userId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.moderation.kick(principal, params.id, params.userId);
  }

  @Post('rooms/:id/bans')
  @HttpCode(204)
  @ApiOperation({ summary: 'Ban a user from a room (needs room.ban).' })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  async ban(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(BanMemberDto)) body: BanMember,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.moderation.ban(principal, params.id, body);
  }

  @Delete('rooms/:id/bans/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unban a user from a room (needs room.ban).' })
  @ApiProblemResponses({ statuses: [403, 404] })
  async unban(
    @Param(new ZodValidationPipe(RoomMemberParamSchema)) params: { id: string; userId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.moderation.unban(principal, params.id, params.userId);
  }

  @Patch('rooms/:id/members/:userId')
  @ApiOperation({ summary: 'Change a member role (needs room.manage_roles).' })
  @ApiOkResponse({ type: MembershipViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  changeRole(
    @Param(new ZodValidationPipe(RoomMemberParamSchema)) params: { id: string; userId: string },
    @Body(new ZodValidationPipe(ChangeRoleDto)) body: ChangeRole,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MembershipView> {
    return this.membership.changeRole(principal, params.id, params.userId, body.role);
  }
}
