import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { SensitiveThrottleGuard } from '../auth/sensitive-throttle.guard.js';
import { AuthGuard } from '../guards/auth.guard.js';
import { OwnerGuard } from '../guards/owner.guard.js';
import type { AccountView } from './account.view.js';
import {
  type AdminCreateUserBody,
  AdminCreateUserSchema,
  type RegisterBody,
  RegisterSchema,
} from './registration.dto.js';
import { RegistrationService } from './registration.service.js';

/**
 * Self-service registration (technical.md §8, issue #15). Behaviour depends on
 * `registration.mode`: `open`, `invite` (needs `invitationToken`), or `admin`
 * (`403 identity.registration_closed`).
 */
@Controller('auth/register')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post()
  @Public()
  @UseGuards(SensitiveThrottleGuard)
  @HttpCode(201)
  register(@Body(new ZodValidationPipe(RegisterSchema)) body: RegisterBody): Promise<AccountView> {
    return this.registration.register({
      name: body.name,
      email: body.email,
      password: body.password,
      displayName: body.displayName,
      invitationToken: body.invitationToken ?? null,
    });
  }
}

/**
 * Owner-only account creation, used when `registration.mode = admin`
 * (technical.md §8, §16).
 */
@Controller('admin/users')
@UseGuards(AuthGuard, OwnerGuard)
export class AdminUsersController {
  constructor(private readonly registration: RegistrationService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(AdminCreateUserSchema)) body: AdminCreateUserBody,
  ): Promise<AccountView> {
    return this.registration.adminCreate(body);
  }
}
