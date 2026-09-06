import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service.js';
import { ConfigService } from '../../../core/config/config.service.js';
import { EmailVerificationService } from '../email-verification/email-verification.service.js';
import { RegistrationClosedError } from '../identity.errors.js';
import { InvitationService } from '../invitations/invitation.service.js';
import { AccountService, type CreateAccountInput, type UserRecord } from './account.service.js';
import { type AccountView, toAccountView } from './account.view.js';
import { PasswordService } from './password.service.js';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  displayName: string;
  invitationToken?: string | null;
}

export interface AdminCreateInput {
  name: string;
  email: string;
  password: string;
  displayName: string;
  isOwner?: boolean;
}

/**
 * Registration orchestration (technical.md §8, issue #15). Applies the
 * `registration.mode` policy, the minimal password policy, invitation
 * validation, and the post-create verification trigger.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly config: ConfigService,
    private readonly accounts: AccountService,
    private readonly passwords: PasswordService,
    private readonly invitations: InvitationService,
    private readonly emailVerification: EmailVerificationService,
    private readonly audit: AuditService,
  ) {}

  /** Public self-service registration. */
  async register(input: RegisterInput): Promise<AccountView> {
    const mode = this.config.get('registration.mode');
    if (mode === 'admin') {
      throw new RegistrationClosedError();
    }

    this.passwords.assertAcceptable(input.password);
    const email = input.email.normalize('NFC').trim().toLowerCase();

    let invitationId: string | null = null;
    let afterCreate: CreateAccountInput['afterCreate'];
    if (mode === 'invite') {
      invitationId = await this.invitations.assertValid(input.invitationToken ?? '', email);
      const id = invitationId;
      afterCreate = (tx, user) => this.invitations.markConsumed(tx, id, user.id);
    }

    const account = await this.accounts.createAccount({
      name: input.name,
      email,
      password: input.password,
      displayName: input.displayName,
      emailVerified: !this.verificationRequired(),
      afterCreate,
    });

    await this.afterAccountCreated(account, { invitationId });

    return toAccountView(account, input.displayName, this.config.get('server.domain'));
  }

  /** Owner-driven account creation for `admin` mode (technical.md §8). */
  async adminCreate(input: AdminCreateInput): Promise<AccountView> {
    this.passwords.assertAcceptable(input.password);

    const account = await this.accounts.createAccount({
      name: input.name,
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      isOwner: input.isOwner ?? false,
      // The owner vouches for the address; no end user is present to click a link.
      emailVerified: true,
    });

    await this.audit.record({
      action: 'identity.account_registered',
      actorUserId: account.id,
      targetType: 'user',
      targetId: account.id,
      metadata: { mode: 'admin', isOwner: account.isOwner },
    });

    return toAccountView(account, input.displayName, this.config.get('server.domain'));
  }

  private async afterAccountCreated(
    account: UserRecord,
    context: { invitationId: string | null },
  ): Promise<void> {
    if (this.verificationRequired() && account.email) {
      await this.emailVerification.startVerification(account.id, account.email);
    }

    await this.audit.record({
      action: 'identity.account_registered',
      actorUserId: account.id,
      targetType: 'user',
      targetId: account.id,
      metadata: {
        mode: this.config.get('registration.mode'),
        invited: context.invitationId !== null,
      },
    });
  }

  private verificationRequired(): boolean {
    return this.config.get('email.verification_required');
  }
}
