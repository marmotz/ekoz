import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import {
  type GroupDetail,
  GroupDetailDto,
  type GroupListView,
  GroupListViewDto,
} from './group.view.js';
import {
  type CreateGroup,
  CreateGroupDto,
  GroupMemberParamSchema,
  GroupParamSchema,
  type RenameGroup,
  RenameGroupDto,
} from './groups.dto.js';
import { GroupsService } from './groups.service.js';

@ApiTags('Conversations — groups')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get('rooms/:id/groups')
  @ApiOperation({ summary: 'Groups defined on the room and its ancestors (needs room.read).' })
  @ApiOkResponse({ type: GroupListViewDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  list(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<GroupListView> {
    return this.groups.list(principal, params.id);
  }

  @Get('rooms/:id/groups/:groupId')
  @ApiOperation({ summary: 'A group and its members (needs room.read).' })
  @ApiOkResponse({ type: GroupDetailDto })
  @ApiProblemResponses({ statuses: [403, 404] })
  get(
    @Param(new ZodValidationPipe(GroupParamSchema)) params: { id: string; groupId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<GroupDetail> {
    return this.groups.get(principal, params.id, params.groupId);
  }

  @Post('rooms/:id/groups')
  @ApiOperation({ summary: 'Create a group on the room (needs room.manage_groups).' })
  @ApiCreatedResponse({ type: GroupDetailDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 409, 422] })
  create(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(CreateGroupDto)) body: CreateGroup,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<GroupDetail> {
    return this.groups.create(principal, params.id, body);
  }

  @Patch('rooms/:id/groups/:groupId')
  @ApiOperation({ summary: 'Rename a group (needs room.manage_groups on its node).' })
  @ApiOkResponse({ type: GroupDetailDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 404, 409, 422] })
  rename(
    @Param(new ZodValidationPipe(GroupParamSchema)) params: { id: string; groupId: string },
    @Body(new ZodValidationPipe(RenameGroupDto)) body: RenameGroup,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<GroupDetail> {
    return this.groups.rename(principal, params.id, params.groupId, body);
  }

  @Delete('rooms/:id/groups/:groupId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a group (needs room.manage_groups on its node).' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404] })
  async remove(
    @Param(new ZodValidationPipe(GroupParamSchema)) params: { id: string; groupId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.groups.remove(principal, params.id, params.groupId);
  }

  @Put('rooms/:id/groups/:groupId/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Add a member to a group (needs room.manage_groups on its node).' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404, 422] })
  async addMember(
    @Param(new ZodValidationPipe(GroupMemberParamSchema))
    params: { id: string; groupId: string; userId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.groups.addMember(principal, params.id, params.groupId, params.userId);
  }

  @Delete('rooms/:id/groups/:groupId/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a member from a group (needs room.manage_groups on its node).' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404] })
  async removeMember(
    @Param(new ZodValidationPipe(GroupMemberParamSchema))
    params: { id: string; groupId: string; userId: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.groups.removeMember(principal, params.id, params.groupId, params.userId);
  }
}
