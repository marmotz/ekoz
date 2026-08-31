import { Module } from '@nestjs/common';
import { AccountService } from './accounts/account.service.js';
import { IdentifierService } from './accounts/identifier.service.js';
import { PasswordService } from './accounts/password.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { RefreshTokenService } from './auth/refresh-token.service.js';
import { RevokedSessionRegistry } from './auth/revoked-session.registry.js';
import { SessionService } from './auth/session.service.js';
import { SessionsController } from './auth/sessions.controller.js';
import { TokenService } from './auth/token.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { OwnerGuard } from './guards/owner.guard.js';

/**
 * Identity and profiles (technical.md, ADR 0007 / 0008). This increment ships
 * the account slice (model, identifier, password hashing — #12), tokens +
 * refresh rotation + guards (#13) and session management (#14). Registration,
 * verification, reset, profiles and the lifecycle land on later tasks.
 *
 * `AuthGuard` / `OwnerGuard` are exported for controllers to opt into with
 * `@UseGuards(...)`; a later task promotes `AuthGuard` to a global guard once
 * every core controller has been audited for `@Public()`.
 */
@Module({
  controllers: [AuthController, SessionsController],
  providers: [
    IdentifierService,
    PasswordService,
    AccountService,
    TokenService,
    RevokedSessionRegistry,
    SessionService,
    RefreshTokenService,
    AuthService,
    AuthGuard,
    OwnerGuard,
  ],
  exports: [AccountService, IdentifierService, PasswordService, TokenService, SessionService, AuthGuard, OwnerGuard],
})
export class IdentityModule {}
