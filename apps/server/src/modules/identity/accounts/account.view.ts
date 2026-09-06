import type { UserRecord } from './account.service.js';

/** The client-facing summary of an account (technical.md §13, §16). */
export interface AccountView {
  id: string;
  /** Canonical `name/server` identifier; `null` for a deleted account. */
  identifier: string | null;
  email: string | null;
  displayName: string;
  isOwner: boolean;
  emailVerified: boolean;
  status: UserRecord['status'];
}

export function toAccountView(
  user: UserRecord,
  displayName: string,
  serverDomain: string,
): AccountView {
  return {
    id: user.id,
    identifier: user.name ? `${user.name}/${serverDomain}` : null,
    email: user.email,
    displayName,
    isOwner: user.isOwner,
    emailVerified: user.emailVerifiedAt !== null,
    status: user.status,
  };
}
