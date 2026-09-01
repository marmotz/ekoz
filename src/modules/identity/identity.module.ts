import { Module } from '@nestjs/common';
import { AccountService } from './accounts/account.service.js';
import { IdentifierService } from './accounts/identifier.service.js';
import {
  AdminOwnersController,
  AdminUserLifecycleController,
  MeDeletionController,
} from './accounts/lifecycle.controller.js';
import { LifecycleService } from './accounts/lifecycle.service.js';
import { PasswordResetController } from './accounts/password-reset.controller.js';
import { PasswordResetService } from './accounts/password-reset.service.js';
import { PasswordService } from './accounts/password.service.js';
import { AdminUsersController, RegistrationController } from './accounts/registration.controller.js';
import { RegistrationService } from './accounts/registration.service.js';
import { SetupOwnerService } from './accounts/setup-owner.service.js';
import { SetupController } from './accounts/setup.controller.js';
import { AdminUsernameRequestsController, MeUsernameController } from './accounts/username.controller.js';
import { UsernameService } from './accounts/username.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { RefreshTokenService } from './auth/refresh-token.service.js';
import { RevokedSessionRegistry } from './auth/revoked-session.registry.js';
import { SensitiveThrottleGuard } from './auth/sensitive-throttle.guard.js';
import { SessionService } from './auth/session.service.js';
import { SessionsController } from './auth/sessions.controller.js';
import { TokenService } from './auth/token.service.js';
import { EmailVerificationController, MeEmailController } from './email-verification/email-verification.controller.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { OwnerGuard } from './guards/owner.guard.js';
import { InvitationService } from './invitations/invitation.service.js';
import { InvitationsController } from './invitations/invitations.controller.js';
import { MeController, UsersController } from './profile/profile.controller.js';
import { ProfileService } from './profile/profile.service.js';

/**
 * Identity and profiles (technical.md, ADR 0007 / 0008 / 0010). Accounts,
 * identifier, password hashing (#12); tokens / refresh rotation / guards (#13);
 * session management (#14); registration modes and invitations (#15); email
 * verification and email change (#16); first-owner setup (#18); password reset
 * (#17); profile and avatar (#19); policy-driven identifier changes (#20);
 * suspension / deletion / owner management (#21); and the credential-endpoint
 * throttle (#22).
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
    PasswordResetController,
    MeController,
    UsersController,
    MeUsernameController,
    AdminUsernameRequestsController,
    AdminUserLifecycleController,
    AdminOwnersController,
    MeDeletionController,
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
    PasswordResetService,
    ProfileService,
    UsernameService,
    LifecycleService,
    SensitiveThrottleGuard,
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
    ProfileService,
    AuthGuard,
    OwnerGuard,
  ],
})
export class IdentityModule {}
