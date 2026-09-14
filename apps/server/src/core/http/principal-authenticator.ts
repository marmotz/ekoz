import type { Request } from 'express';

/** The authenticated principal, attached to the request by {@link AuthGuard}. */
export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  isOwner: boolean;
}

/** Express request augmented with the principal. */
export interface AuthenticatedRequest extends Request {
  principal?: AuthPrincipal;
}

/**
 * Seam between the generic {@link AuthGuard} (core/http) and whichever feature
 * owns accounts and sessions. `AuthGuard` extracts the bearer token and
 * delegates verification here; the identity feature binds {@link
 * PRINCIPAL_AUTHENTICATOR} to a real implementation
 * (`IdentityPrincipalAuthenticator`) — see
 * `docs/technical/shared-auth-guard.md`.
 */
export interface PrincipalAuthenticator {
  /** Verify `bearerToken` and resolve the principal, or throw a {@link DomainError}. */
  authenticate(bearerToken: string): Promise<AuthPrincipal>;
}

/** DI token for the active {@link PrincipalAuthenticator}. */
export const PRINCIPAL_AUTHENTICATOR = Symbol('PRINCIPAL_AUTHENTICATOR');
