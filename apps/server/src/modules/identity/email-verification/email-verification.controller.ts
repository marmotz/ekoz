import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { SensitiveThrottleGuard } from '../auth/sensitive-throttle.guard.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import {
  ChangeEmailSchema,
  ResendVerificationSchema,
  VerifyEmailSchema,
  type ChangeEmailBody,
  type ResendVerificationBody,
  type VerifyEmailBody,
} from './email-verification.dto.js';
import { EmailVerificationService } from './email-verification.service.js';

/**
 * Email verification endpoints (technical.md §9, issue #16). `verify-email` and
 * its `resend` are public; `resend` never reveals whether the address exists.
 */
@Controller('auth/verify-email')
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  @Post()
  @Public()
  @HttpCode(200)
  async verify(@Body(new ZodValidationPipe(VerifyEmailSchema)) body: VerifyEmailBody): Promise<{ verified: true }> {
    await this.verification.verify(body.token);

    return { verified: true };
  }

  @Post('resend')
  @Public()
  @UseGuards(SensitiveThrottleGuard)
  @HttpCode(202)
  async resend(
    @Body(new ZodValidationPipe(ResendVerificationSchema)) body: ResendVerificationBody
  ): Promise<{ accepted: true }> {
    await this.verification.resend(body.email);

    return { accepted: true };
  }
}

/**
 * Email change for the authenticated account (technical.md §9). The new address
 * is only applied once its verification token is consumed.
 */
@Controller('me/email')
@UseGuards(AuthGuard)
export class MeEmailController {
  constructor(private readonly verification: EmailVerificationService) {}

  @Post()
  @HttpCode(202)
  async change(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(ChangeEmailSchema)) body: ChangeEmailBody
  ): Promise<{ accepted: true }> {
    await this.verification.requestEmailChange(principal.userId, body.newEmail, body.password);

    return { accepted: true };
  }
}
