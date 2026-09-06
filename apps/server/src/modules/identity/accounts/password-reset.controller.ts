import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { SensitiveThrottleGuard } from '../auth/sensitive-throttle.guard.js';
import {
  type ConfirmPasswordResetBody,
  ConfirmPasswordResetSchema,
  type RequestPasswordResetBody,
  RequestPasswordResetSchema,
} from './password-reset.dto.js';
import { PasswordResetService } from './password-reset.service.js';

/**
 * Password reset endpoints (technical.md §10, issue #17). Both are public;
 * `request` always answers `202` so it never leaks whether an account exists.
 */
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post('request')
  @Public()
  @UseGuards(SensitiveThrottleGuard)
  @HttpCode(202)
  async request(
    @Body(new ZodValidationPipe(RequestPasswordResetSchema)) body: RequestPasswordResetBody,
    @Req() request: Request,
  ): Promise<{ accepted: true }> {
    await this.passwordReset.request(body.email, request.ip ?? null);

    return { accepted: true };
  }

  @Post('confirm')
  @Public()
  @HttpCode(204)
  async confirm(
    @Body(new ZodValidationPipe(ConfirmPasswordResetSchema)) body: ConfirmPasswordResetBody,
  ): Promise<void> {
    await this.passwordReset.confirm(body.token, body.newPassword);
  }
}
