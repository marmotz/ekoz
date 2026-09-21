import { Module } from '@nestjs/common';
import { AccountService } from './accounts/account.service.js';
import { AdminUserQueryController } from './accounts/admin-users.controller.js';
import { AdminUsersQueryService } from './accounts/admin-users.service.js';
import { IdentifierService } from './accounts/identifier.service.js';
import {
  AdminOwnersController,
  AdminUserLifecycleController,
  MeDeletionController,
} from './accounts/lifecycle.controller.js';
import { LifecycleService } from './accounts/lifecycle.service.js';
import { PasswordService } from './accounts/password.service.js';
import { MePasswordController } from './accounts/password-change.controller.js';
import { PasswordChangeService } from './accounts/password-change.service.js';
import { PasswordResetController } from './accounts/password-reset.controller.js';
import { PasswordResetService } from './accounts/password-reset.service.js';
import {
  AdminUsersController,
  RegistrationController,
} from './accounts/registration.controller.js';
import { RegistrationService } from './accounts/registration.service.js';
import { SetupController } from './accounts/setup.controller.js';
import { SetupOwnerService } from './accounts/setup-owner.service.js';
import { SetupStateController } from './accounts/setup-state.controller.js';
import {
  AdminUsernameRequestsController,
  MeUsernameController,
} from './accounts/username.controller.js';
import { UsernameService } from './accounts/username.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AuthPolicyController } from './auth/auth-policy.controller.js';
import { RefreshTokenService } from './auth/refresh-token.service.js';
import { RevokedSessionRegistry } from './auth/revoked-session.registry.js';
import { SensitiveThrottleGuard } from './auth/sensitive-throttle.guard.js';
import { SessionService } from './auth/session.service.js';
import { SessionsController } from './auth/sessions.controller.js';
import { StreamController } from './auth/stream.controller.js';
import { InProcessStreamTicketStore, STREAM_TICKET_STORE } from './auth/stream-ticket.store.js';
import { TicketService } from './auth/ticket.service.js';
import { TokenService } from './auth/token.service.js';
import {
  EmailVerificationController,
  MeEmailController,
} from './email-verification/email-verification.controller.js';
import { EmailVerificationService } from './email-verification/email-verification.service.js';
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
 * suspension / deletion / owner management (#21); the credential-endpoint
 * throttle (#22); and the SSE stream ticket (#23).
 *
 * `AuthGuard` / `OwnerGuard` (core/http) are the shared guards controllers opt
 * into with `@UseGuards(...)`; this module binds their `PRINCIPAL_AUTHENTICATOR`
 * seam to a real implementation via `PrincipalAuthenticatorModule` (sibling
 * module in `guards/`), not here — see `docs/technical/shared-auth-guard.md`.
 */
@Module({
  controllers: [
    AuthController,
    AuthPolicyController,
    SessionsController,
    StreamController,
    RegistrationController,
    AdminUsersController,
    AdminUserQueryController,
    EmailVerificationController,
    MeEmailController,
    MePasswordController,
    InvitationsController,
    SetupController,
    SetupStateController,
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
    TicketService,
    { provide: STREAM_TICKET_STORE, useClass: InProcessStreamTicketStore },
    RefreshTokenService,
    AuthService,
    RegistrationService,
    EmailVerificationService,
    InvitationService,
    SetupOwnerService,
    PasswordResetService,
    PasswordChangeService,
    ProfileService,
    UsernameService,
    LifecycleService,
    AdminUsersQueryService,
    SensitiveThrottleGuard,
  ],
  exports: [
    AccountService,
    IdentifierService,
    PasswordService,
    TokenService,
    RevokedSessionRegistry,
    SessionService,
    TicketService,
    EmailVerificationService,
    InvitationService,
    ProfileService,
  ],
})
export class IdentityModule {}
