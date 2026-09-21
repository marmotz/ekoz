import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../../core/audit/audit.service.js';
import type { AuthPrincipal } from '../../../core/http/auth.guard.js';
import type { SessionService } from '../auth/session.service.js';
import { InvalidCredentialsError, WeakPasswordError } from '../identity.errors.js';
import type { AccountService } from './account.service.js';
import { PasswordService } from './password.service.js';
import { PasswordChangeService } from './password-change.service.js';

const CURRENT = 'the-current-passphrase';
const principal: AuthPrincipal = { userId: 'u1', sessionId: 's-current', isOwner: false };

async function makeService(revoked = 2) {
  const passwords = new PasswordService();
  const passwordHash = await passwords.hash(CURRENT);
  const accounts = {
    findById: vi.fn(async () => ({ id: 'u1', passwordHash })),
    updatePasswordHash: vi.fn(async () => undefined),
  };
  const sessions = { revokeAllForUser: vi.fn(async () => revoked) };
  const audit = { record: vi.fn(async () => undefined) };

  const service = new PasswordChangeService(
    accounts as unknown as AccountService,
    passwords,
    sessions as unknown as SessionService,
    audit as unknown as AuditService,
  );

  return { service, passwords, accounts, sessions, audit };
}

describe('PasswordChangeService (unit)', () => {
  it('rejects a wrong current password without touching anything', async () => {
    const { service, accounts, sessions, audit } = await makeService();

    await expect(
      service.change(principal, 'nope-nope-nope', 'a-brand-new-passphrase'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(accounts.updatePasswordHash).not.toHaveBeenCalled();
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a weak new password', async () => {
    const { service, accounts } = await makeService();

    await expect(service.change(principal, CURRENT, 'short')).rejects.toBeInstanceOf(
      WeakPasswordError,
    );
    expect(accounts.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('rejects a new password equal to the current one with a dedicated detail', async () => {
    const { service, accounts } = await makeService();

    const error = await service.change(principal, CURRENT, CURRENT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WeakPasswordError);
    expect((error as WeakPasswordError).message).toContain('differ');
    expect(accounts.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('stores the new hash, revokes the other sessions and audits the change', async () => {
    const { service, passwords, accounts, sessions, audit } = await makeService(3);

    await service.change(principal, CURRENT, 'a-brand-new-passphrase');

    const [userId, hash] = accounts.updatePasswordHash.mock.calls[0] as unknown as [string, string];
    expect(userId).toBe('u1');
    expect(await passwords.verify(hash, 'a-brand-new-passphrase')).toBe(true);

    expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1', {
      exceptSessionId: 's-current',
      reason: 'password_changed',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_changed',
        actorUserId: 'u1',
        metadata: { revokedSessions: 3 },
      }),
    );
  });
});
