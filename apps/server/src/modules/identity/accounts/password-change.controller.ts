import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
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
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { type ChangePasswordBody, ChangePasswordDto } from './password-change.dto.js';
import { PasswordChangeService } from './password-change.service.js';

/** `POST /me/password` — change the password of the calling account. */
@ApiTags('Account')
@ApiBearerAuth('bearer')
@Controller('me/password')
@UseGuards(AuthGuard)
export class MePasswordController {
  constructor(private readonly passwordChange: PasswordChangeService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Change the password (requires the current one); revokes the other sessions.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiNoContentResponse()
  @ApiProblemResponses({ validation: true })
  change(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body(new ZodValidationPipe(ChangePasswordDto)) body: ChangePasswordBody,
  ): Promise<void> {
    return this.passwordChange.change(principal, body.currentPassword, body.newPassword);
  }
}
