import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { type MembershipView, MembershipViewDto } from '../membership/membership.view.js';
import { type RoomView, RoomViewDto } from '../rooms/room.view.js';
import {
  type AddGroupDmMembers,
  AddGroupDmMembersDto,
  GroupDmIdParamSchema,
  GroupDmMemberParamSchema,
  type RenameGroupDm,
  RenameGroupDmDto,
} from './group-dm.dto.js';
import { GroupDmService } from './group-dm.service.js';

@ApiTags('Conversations — group dm')
@ApiBearerAuth('bearer')
@Controller('group-dms/:id')
@UseGuards(AuthGuard)
export class GroupDmController {
  constructor(private readonly groups: GroupDmService) {}

  @Patch()
  @ApiBody({ type: RenameGroupDmDto })
  @ApiOperation({ summary: 'Rename a group conversation, or clear its name (group admin).' })
  @ApiOkResponse({ type: RoomViewDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  rename(
    @Param(new ZodValidationPipe(GroupDmIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(RenameGroupDmDto)) body: RenameGroupDm,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RoomView> {
    return this.groups.rename(principal, params.id, body);
  }

  @Post('members')
  @ApiBody({ type: AddGroupDmMembersDto })
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Add members to a group conversation, with or without its past messages (group admin).',
  })
  @ApiOkResponse({ type: MembershipViewDto, isArray: true })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 422] })
  addMembers(
    @Param(new ZodValidationPipe(GroupDmIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(AddGroupDmMembersDto)) body: AddGroupDmMembers,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MembershipView[]> {
    return this.groups.addMembers(principal, params.id, body);
  }

  @Delete('members/:userId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a member (group admin); removing oneself is leaving the group.',
  })
  @ApiProblemResponses({ statuses: [403, 404] })
  async removeMember(
    @Param(new ZodValidationPipe(GroupDmMemberParamSchema)) params: { id: string; userId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.groups.removeMember(principal, params.id, params.userId);
  }

  @Put('admins/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Make a member a group admin (group admin).' })
  @ApiProblemResponses({ statuses: [403, 404] })
  async grantAdmin(
    @Param(new ZodValidationPipe(GroupDmMemberParamSchema)) params: { id: string; userId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.groups.grantAdmin(principal, params.id, params.userId);
  }

  @Delete('admins/:userId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Revoke a group admin; the group is deleted when no admin remains (group admin).',
  })
  @ApiProblemResponses({ statuses: [403, 404] })
  async revokeAdmin(
    @Param(new ZodValidationPipe(GroupDmMemberParamSchema)) params: { id: string; userId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.groups.revokeAdmin(principal, params.id, params.userId);
  }
}
