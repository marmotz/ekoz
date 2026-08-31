import { Module } from '@nestjs/common';
import { AccountService } from './accounts/account.service.js';
import { IdentifierService } from './accounts/identifier.service.js';
import { PasswordService } from './accounts/password.service.js';
import { AdminUsersController, RegistrationController } from './accounts/registration.controller.js';
import { RegistrationService } from './accounts/registration.service.js';
import { SetupOwnerService } from './accounts/setup-owner.service.js';
import { SetupController } from './accounts/setup.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { RefreshTokenService } from './auth/refresh-token.service.js';
import { RevokedSessionRegistry } from './auth/revoked-session.registry.js';
import { SessionService } from './auth/session.service.js';
import { SessionsController } from './auth/sessions.controller.js';
import { TokenService } from './auth/token.service.js';
import { EmailVerificationController, MeEmailController } from './email-verification/email-verification.controller.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { OwnerGuard } from './guards/owner.guard.js';
import { InvitationService } from './invitations/invitation.service.js';
import { InvitationsController } from './invitations/invitations.controller.js';

/**
 * Identity and profiles (technical.md, ADR 0007 / 0008 / 0010). This increment
 * ships accounts + identifier + password hashing (#12), tokens / refresh
 * rotation / guards (#13), session management (#14), registration modes and
 * invitations (#15), email verification and email change (#16), and the
 * first-owner setup endpoint (#18).
 *
 * `AuthGuard` / `OwnerGuard` are exported for controllers to opt into with
 * `@UseGuards(...)`; a later task promotes `AuthGuard` to a global guard once
 * every core controller has been audited for `@Public()`.
 */
@Module({
  controllers: [
    AuthController,
    SessionsController,
    RegistrationController,
    AdminUsersController,
    EmailVerificationController,
    MeEmailController,
    InvitationsController,
    SetupController,
  ],
  providers: [
    IdentifierService,
    PasswordService,
    AccountService,
    TokenService,
    RevokedSessionRegistry,
    SessionService,
    RefreshTokenService,
    AuthService,
    RegistrationService,
    EmailVerificationService,
    InvitationService,
    SetupOwnerService,
    AuthGuard,
    OwnerGuard,
  ],
  exports: [
    AccountService,
    IdentifierService,
    PasswordService,
    TokenService,
    SessionService,
    EmailVerificationService,
    InvitationService,
    AuthGuard,
    OwnerGuard,
  ],
})
export class IdentityModule {}
