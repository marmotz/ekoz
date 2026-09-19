import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiProblemResponses } from '../../../core/http/api-problem-responses.decorator.js';
import { AuthGuard, type AuthPrincipal } from '../../../core/http/auth.guard.js';
import { CurrentPrincipal } from '../../../core/http/current-principal.decorator.js';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import {
  type LoginBody,
  LoginDto,
  LoginResponseDto,
  type RefreshBody,
  RefreshDto,
  TokenBundleDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { SensitiveThrottleGuard } from './sensitive-throttle.guard.js';
import { toSessionView } from './session.view.js';

/**
 * Credential endpoints (technical.md §7, §11). `login` / `refresh` are
 * unauthenticated; `logout` needs a valid access token.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @UseGuards(SensitiveThrottleGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Exchange credentials for an access + refresh token pair.' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiProblemResponses({ auth: false, validation: true, statuses: [401, 403, 429] })
  async login(@Body(new ZodValidationPipe(LoginDto)) body: LoginBody, @Req() request: Request) {
    const result = await this.auth.login({
      identifier: body.identifier,
      password: body.password,
      deviceName: body.deviceName ?? null,
      userAgent: request.get('user-agent') ?? null,
      ip: request.ip ?? null,
    });

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      session: toSessionView(result.session, result.session.id),
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate a refresh token for a fresh token pair.' })
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ type: TokenBundleDto })
  @ApiProblemResponses({ auth: false, validation: true, statuses: [401] })
  async refresh(@Body(new ZodValidationPipe(RefreshDto)) body: RefreshBody) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke the calling session.' })
  @ApiNoContentResponse()
  @ApiProblemResponses()
  async logout(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    await this.auth.logout(principal.sessionId);
  }
}
