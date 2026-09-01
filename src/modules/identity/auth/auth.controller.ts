import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../core/http/public.decorator.js';
import { ZodValidationPipe } from '../../../core/http/zod-validation.pipe.js';
import { AuthGuard, type AuthPrincipal } from '../guards/auth.guard.js';
import { CurrentPrincipal } from '../guards/current-principal.decorator.js';
import { LoginSchema, RefreshSchema, type LoginBody, type RefreshBody } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { SensitiveThrottleGuard } from './sensitive-throttle.guard.js';
import { toSessionView } from './session.view.js';

/**
 * Credential endpoints (technical.md §7, §11). `login` / `refresh` are
 * unauthenticated; `logout` needs a valid access token.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @UseGuards(SensitiveThrottleGuard)
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginBody, @Req() request: Request) {
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
  async refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshBody) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async logout(@CurrentPrincipal() principal: AuthPrincipal): Promise<void> {
    await this.auth.logout(principal.sessionId);
  }
}
