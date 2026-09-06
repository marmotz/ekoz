import { Body, Controller, Delete, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { OwnerGuard } from '../guards/owner.guard.js';
import {
  type AddOwnerBody,
  AddOwnerSchema,
  type DeleteMeBody,
  DeleteMeSchema,
  type SuspendUserBody,
  SuspendUserSchema,
} from './lifecycle.dto.js';
import { LifecycleService } from './lifecycle.service.js';

/** Owner-driven account lifecycle (technical.md §15, §16). */
@Controller('admin/users')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminUserLifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Post(':id/suspend')
  @HttpCode(204)
  suspend(
    @Param('id') id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(SuspendUserSchema)) body: SuspendUserBody,
  ): Promise<void> {
    return this.lifecycle.suspend(id, body.reason, principal.userId);
  }

  @Post(':id/unsuspend')
  @HttpCode(204)
  unsuspend(@Param('id') id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.lifecycle.unsuspend(id, principal.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    return this.lifecycle.deleteByOwner(id, principal.userId);
  }
}

/** Owner management (technical.md §15): at least one owner must remain. */
@Controller('admin/owners')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminOwnersController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Post()
  @HttpCode(204)
  add(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(AddOwnerSchema)) body: AddOwnerBody,
  ): Promise<void> {
    return this.lifecycle.addOwner(body.userId, principal.userId);
  }

  @Delete(':userId')
  @HttpCode(204)
  remove(
    @Param('userId') userId: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<void> {
    return this.lifecycle.removeOwner(userId, principal.userId);
  }
}

/** Self-service account deletion (technical.md §15). Re-authenticates. */
@Controller('me')
@UseGuards(AuthGuard)
export class MeDeletionController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Delete()
  @HttpCode(204)
  deleteSelf(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(DeleteMeSchema)) body: DeleteMeBody,
  ): Promise<void> {
    return this.lifecycle.deleteSelf(principal.userId, body.password);
  }
}
