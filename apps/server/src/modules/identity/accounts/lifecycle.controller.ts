import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { OwnerGuard } from '../../../core/http/owner.guard.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import {
  type AddOwnerBody,
  AddOwnerDto,
  type DeleteMeBody,
  DeleteMeDto,
  type SuspendUserBody,
  SuspendUserDto,
} from './lifecycle.dto.js';
import { LifecycleService } from './lifecycle.service.js';

/** Owner-driven account lifecycle (technical.md §15, §16). */
@ApiTags('Account lifecycle')
@ApiBearerAuth('bearer')
@Controller('admin/users')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminUserLifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Post(':id/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Suspend an account.' })
  @ApiBody({ type: SuspendUserDto })
  @ApiNoContentResponse()
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  suspend(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(SuspendUserDto)) body: SuspendUserBody,
  ): Promise<void> {
    return this.lifecycle.suspend(id, body.reason, principal.userId);
  }

  @Post(':id/unsuspend')
  @HttpCode(204)
  @ApiOperation({ summary: 'Lift an account suspension.' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404] })
  unsuspend(@Param('id') id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.lifecycle.unsuspend(id, principal.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an account (owner).' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404] })
  remove(@Param('id') id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.lifecycle.deleteByOwner(id, principal.userId);
  }
}

/** Owner management (technical.md §15): at least one owner must remain. */
@ApiTags('Account lifecycle')
@ApiBearerAuth('bearer')
@Controller('admin/owners')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminOwnersController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Grant owner rights to an account.' })
  @ApiBody({ type: AddOwnerDto })
  @ApiNoContentResponse()
  @ApiProblemResponses({ validation: true, statuses: [403, 404] })
  add(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(AddOwnerDto)) body: AddOwnerBody,
  ): Promise<void> {
    return this.lifecycle.addOwner(body.userId, principal.userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke owner rights (a last owner cannot be removed).' })
  @ApiNoContentResponse()
  @ApiProblemResponses({ statuses: [403, 404, 409] })
  remove(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    return this.lifecycle.removeOwner(userId, principal.userId);
  }
}

/** Self-service account deletion (technical.md §15). Re-authenticates. */
@ApiTags('Account lifecycle')
@ApiBearerAuth('bearer')
@Controller('me')
@UseGuards(AuthGuard)
export class MeDeletionController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete the calling account (requires the password).' })
  @ApiBody({ type: DeleteMeDto })
  @ApiNoContentResponse()
  @ApiProblemResponses({ validation: true, statuses: [403] })
  deleteSelf(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(DeleteMeDto)) body: DeleteMeBody,
  ): Promise<void> {
    return this.lifecycle.deleteSelf(principal.userId, body.password);
  }
}
