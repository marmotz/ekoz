import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiNoContentResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { SensitiveThrottleGuard } from '../auth/sensitive-throttle.guard.js';
import {
  AcceptedResponseDto,
  type ConfirmPasswordResetBody,
  ConfirmPasswordResetDto,
  type RequestPasswordResetBody,
  RequestPasswordResetDto,
} from './password-reset.dto.js';
import { PasswordResetService } from './password-reset.service.js';

/**
 * Password reset endpoints (technical.md §10, issue #17). Both are public;
 * `request` always answers `202` so it never leaks whether an account exists.
 */
@ApiTags('Password reset')
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post('request')
  @Public()
  @UseGuards(SensitiveThrottleGuard)
  @HttpCode(202)
  @ApiOperation({ summary: 'Request a password-reset email (always accepted).' })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiResponse({ status: 202, type: AcceptedResponseDto })
  @ApiProblemResponses({ auth: false, validation: true, statuses: [429] })
  async request(
    @Body(new ZodValidationPipe(RequestPasswordResetDto)) body: RequestPasswordResetBody,
    @Req() request: Request,
  ): Promise<{ accepted: true }> {
    await this.passwordReset.request(body.email, request.ip ?? null);

    return { accepted: true };
  }

  @Post('confirm')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a new password from a reset token; revokes every session.' })
  @ApiBody({ type: ConfirmPasswordResetDto })
  @ApiNoContentResponse()
  @ApiProblemResponses({ auth: false, validation: true, statuses: [401] })
  async confirm(
    @Body(new ZodValidationPipe(ConfirmPasswordResetDto)) body: ConfirmPasswordResetBody,
  ): Promise<void> {
    await this.passwordReset.confirm(body.token, body.newPassword);
  }
}
