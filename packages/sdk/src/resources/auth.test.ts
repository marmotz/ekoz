import { describe, expect, it } from 'vitest';
import { SessionEventEmitter } from '../session/events.js';
import { SessionManager } from '../session/session-manager.js';
import { createFetchMock, jsonResponse } from '../test-support/fetch-mock.js';
import { InvalidCredentialsError } from '../transport/errors.js';
import { HttpClient } from '../transport/http-client.js';
import { createAuthResource } from './auth.js';

function resource(fetchImpl: typeof fetch) {
  const http = new HttpClient({ baseUrl: 'https://api.example.com', fetch: fetchImpl });
  const session = new SessionManager({ httpClient: http, emitter: new SessionEventEmitter() });
  return { auth: createAuthResource(http, session), session };
}

describe('auth resource', () => {
  it('register posts to /auth/register and does not populate the store', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { id: 'u1', identifier: null } }));
    const { auth, session } = resource(fetchMock);

    const account = await auth.register({
      name: 'alice',
      email: 'alice@example.com',
      password: 'x',
      displayName: 'Alice',
    });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/auth/register');
    expect(fetchMock.calls[0]?.init?.method).toBe('POST');
    expect(account.id).toBe('u1');
    expect(session.accessToken).toBeUndefined();
  });

  it('login posts to /auth/login and establishes the session', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        body: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, session: { id: 's1' } },
      }),
    );
    const { auth, session } = resource(fetchMock);

    await auth.login({ identifier: 'alice/example.com', password: 'x' });

    expect(fetchMock.calls[0]?.url).toBe('https://api.example.com/auth/login');
    expect(session.accessToken).toBe('a');
    expect(session.getState()?.sessionId).toBe('s1');
  });

  it('surfaces auth.invalid_credentials as InvalidCredentialsError without a refresh attempt', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ status: 401, body: { code: 'auth.invalid_credentials', status: 401 } }),
    );
    const { auth } = resource(fetchMock);

    await expect(auth.login({ identifier: 'alice/example.com', password: 'x' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(fetchMock.callCount).toBe(1);
  });

  it('logout delegates to the session manager', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({
        body: { accessToken: 'a', refreshToken: 'r', expiresIn: 900, session: { id: 's1' } },
      }),
      jsonResponse({ status: 204 }),
    );
    const { auth, session } = resource(fetchMock);
    await auth.login({ identifier: 'alice/example.com', password: 'x' });

    await auth.logout();

    expect(fetchMock.calls[1]?.url).toBe('https://api.example.com/auth/logout');
    expect(session.accessToken).toBeUndefined();
  });

  it('verifyEmail, resendVerification and password reset hit the expected endpoints', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: { verified: true } }),
      jsonResponse({ body: { accepted: true } }),
      jsonResponse({ body: { accepted: true } }),
      jsonResponse({ status: 204 }),
    );
    const { auth } = resource(fetchMock);

    await auth.verifyEmail({ token: 't' });
    await auth.resendVerification({ email: 'a@example.com' });
    await auth.requestPasswordReset({ email: 'a@example.com' });
    await auth.confirmPasswordReset({ token: 't', newPassword: 'x' });

    expect(fetchMock.calls.map((c) => c.url)).toEqual([
      'https://api.example.com/auth/verify-email',
      'https://api.example.com/auth/verify-email/resend',
      'https://api.example.com/auth/password-reset/request',
      'https://api.example.com/auth/password-reset/confirm',
    ]);
  });
});
