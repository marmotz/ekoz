/**
 * Credential, registration and account-recovery bindings (technical.md §10).
 * `register` never returns tokens — the consumer follows up with `login`.
 */

import type { SessionManager } from '../session/session-manager.js';
import type { HttpClient } from '../transport/http-client.js';
import type {
  AccountView,
  AuthPolicy,
  ConfirmPasswordResetBody,
  EmailAcceptedResponse,
  EmailVerifiedResponse,
  LoginBody,
  LoginResponse,
  RegisterBody,
  RequestPasswordResetBody,
  ResendVerificationBody,
  VerifyEmailBody,
} from '../types/wire.js';

export interface AuthResource {
  /** `GET /auth/policy` (unauthenticated): registration mode, verification requirement, password minimum. */
  policy(): Promise<AuthPolicy>;
  register(body: RegisterBody): Promise<AccountView>;
  login(body: LoginBody): Promise<LoginResponse>;
  logout(): Promise<void>;
  verifyEmail(body: VerifyEmailBody): Promise<EmailVerifiedResponse>;
  resendVerification(body: ResendVerificationBody): Promise<EmailAcceptedResponse>;
  requestPasswordReset(body: RequestPasswordResetBody): Promise<EmailAcceptedResponse>;
  confirmPasswordReset(body: ConfirmPasswordResetBody): Promise<void>;
}

export function createAuthResource(http: HttpClient, session: SessionManager): AuthResource {
  return {
    policy() {
      return http.request<AuthPolicy>('GET', '/auth/policy');
    },

    register(body) {
      return http.request<AccountView>('POST', '/auth/register', { body });
    },

    async login(body) {
      const result = await http.request<LoginResponse>('POST', '/auth/login', { body });
      await session.establish({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
        sessionId: result.session.id,
        identifier: null,
      });
      return result;
    },

    logout() {
      return session.logout();
    },

    verifyEmail(body) {
      return http.request<EmailVerifiedResponse>('POST', '/auth/verify-email', { body });
    },

    resendVerification(body) {
      return http.request<EmailAcceptedResponse>('POST', '/auth/verify-email/resend', { body });
    },

    requestPasswordReset(body) {
      return http.request<EmailAcceptedResponse>('POST', '/auth/password-reset/request', {
        body,
      });
    },

    confirmPasswordReset(body) {
      return http.request<void>('POST', '/auth/password-reset/confirm', { body });
    },
  };
}
