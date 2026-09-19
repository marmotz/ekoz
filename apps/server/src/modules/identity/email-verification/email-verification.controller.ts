import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { SensitiveThrottleGuard } from '../auth/sensitive-throttle.guard.js';
import {
  type ChangeEmailBody,
  ChangeEmailDto,
  EmailAcceptedResponseDto,
  EmailVerifiedResponseDto,
  type ResendVerificationBody,
  ResendVerificationDto,
  type VerifyEmailBody,
  VerifyEmailDto,
} from './email-verification.dto.js';
import { EmailVerificationService } from './email-verification.service.js';

/**
 * Email verification endpoints (technical.md §9, issue #16). `verify-email` and
 * its `resend` are public; `resend` never reveals whether the address exists.
 */
@ApiTags('Email verification')
@Controller('auth/verify-email')
export class EmailVerificationController {
  constructor(private readonly verification: EmailVerificationService) {}

  @Post()
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Consume an email-verification token.' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiOkResponse({ type: EmailVerifiedResponseDto })
  @ApiProblemResponses({ auth: false, validation: true, statuses: [401] })
  async verify(
    @Body(new ZodValidationPipe(VerifyEmailDto)) body: VerifyEmailBody,
  ): Promise<{ verified: true }> {
    await this.verification.verify(body.token);

    return { verified: true };
  }

  @Post('resend')
  @Public()
  @UseGuards(SensitiveThrottleGuard)
  @HttpCode(202)
  @ApiOperation({ summary: 'Resend the verification email (always accepted).' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 202, type: EmailAcceptedResponseDto })
  @ApiProblemResponses({ auth: false, validation: true, statuses: [429] })
  async resend(
    @Body(new ZodValidationPipe(ResendVerificationDto)) body: ResendVerificationBody,
  ): Promise<{ accepted: true }> {
    await this.verification.resend(body.email);

    return { accepted: true };
  }
}

/**
 * Email change for the authenticated account (technical.md §9). The new address
 * is only applied once its verification token is consumed.
 */
@ApiTags('Email verification')
@ApiBearerAuth('bearer')
@Controller('me/email')
@UseGuards(AuthGuard)
export class MeEmailController {
  constructor(private readonly verification: EmailVerificationService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Request an email-address change (verified before it applies).' })
  @ApiBody({ type: ChangeEmailDto })
  @ApiResponse({ status: 202, type: EmailAcceptedResponseDto })
  @ApiProblemResponses({ validation: true, statuses: [403, 409] })
  async change(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(ChangeEmailDto)) body: ChangeEmailBody,
  ): Promise<{ accepted: true }> {
    await this.verification.requestEmailChange(principal.userId, body.newEmail, body.password);

    return { accepted: true };
  }
}
