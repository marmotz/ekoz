import { Body, Controller, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { RoomIdParamSchema } from '../rooms/rooms.dto.js';
import {
  type MyPermissionsResponse,
  MyPermissionsResponseDto,
  RoomMemberIdParamSchema,
  type SetMemberPermission,
  SetMemberPermissionDto,
  type SetRolePermission,
  SetRolePermissionDto,
} from './permissions.dto.js';
import { PermissionsService } from './permissions.service.js';

@ApiTags('Conversations — permissions')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(AuthGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get('rooms/:id/my-permissions')
  @ApiOperation({ summary: "The caller's effective capability set on this room." })
  @ApiOkResponse({ type: MyPermissionsResponseDto })
  @ApiProblemResponses({ statuses: [404] })
  async myPermissions(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MyPermissionsResponse> {
    const capabilities = await this.permissions.myPermissions(principal, params.id);

    return { capabilities };
  }

  @Put('rooms/:id/permissions')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Set a role-scoped capability override on this node (needs room.manage_permissions).',
  })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  async setRolePermission(
    @Param(new ZodValidationPipe(RoomIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(SetRolePermissionDto)) body: SetRolePermission,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.permissions.setRoleOverride(
      principal,
      params.id,
      body.role,
      body.capability,
      body.effect,
    );
  }

  @Put('rooms/:id/members/:userId/permissions')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Set a per-user capability override on this node (needs room.manage_permissions).',
  })
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  async setMemberPermission(
    @Param(new ZodValidationPipe(RoomMemberIdParamSchema)) params: { id: string; userId: string },
    @Body(new ZodValidationPipe(SetMemberPermissionDto)) body: SetMemberPermission,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    await this.permissions.setMemberOverride(
      principal,
      params.id,
      params.userId,
      body.capability,
      body.effect,
    );
  }
}
