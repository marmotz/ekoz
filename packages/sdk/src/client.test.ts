import { describe, expect, it, vi } from 'vitest';
import { createClient } from './client.js';
import { createFetchMock, jsonResponse } from './test-support/fetch-mock.js';

const discoveryDoc = {
  server: 'ekoz.example.com',
  api: 'https://api.ekoz.example.com',
  web: 'https://ekoz.example.com',
  protocol_versions: ['0'],
};

describe('createClient', () => {
  it('throws without `server` or `resolveApiUrl`', () => {
    expect(() => createClient({})).toThrow(/server.*resolveApiUrl/);
  });

  it('exposes every namespace and the session controller', () => {
    const client = createClient({ server: 'ekoz.example.com' });

    expect(client.setup).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.me).toBeDefined();
    expect(client.users).toBeDefined();
    expect(client.sessions).toBeDefined();
    expect(client.invitations).toBeDefined();
    expect(client.admin).toBeDefined();
    expect(client.rooms).toBeDefined();
    expect(client.roomInvitations).toBeDefined();
    expect(client.directory).toBeDefined();
    expect(client.messages).toBeDefined();
    expect(client.mentions).toBeDefined();
    expect(client.groups).toBeDefined();
    expect(client.sync).toBeDefined();
    expect(client.stream.status).toBe('idle');
    expect(client.discovery).toBeDefined();
    expect(client.session).toBeDefined();
    expect(client.session.getState()).toBeUndefined();
  });

  it('round-trips event subscription through on/off', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: discoveryDoc }),
      jsonResponse({
        body: {
          accessToken: 'a',
          refreshToken: 'r',
          expiresIn: 900,
          session: { id: 's1' },
        },
      }),
    );
    const client = createClient({ server: 'ekoz.example.com', fetch: fetchMock });

    const listener = vi.fn();
    const off = client.on('session:authenticated', listener);
    await client.auth.login({ identifier: 'alice/example.com', password: 'x' });
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    await client.auth.logout();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('resolves the REST base through discovery before each request', async () => {
    const fetchMock = createFetchMock(
      jsonResponse({ body: discoveryDoc }),
      jsonResponse({ body: { verified: true } }),
    );
    const client = createClient({ server: 'ekoz.example.com', fetch: fetchMock });

    await client.auth.verifyEmail({ token: 't' });

    expect(fetchMock.calls[0]?.url).toBe('https://ekoz.example.com/.well-known/ekoz');
    expect(fetchMock.calls[1]?.url).toBe('https://api.ekoz.example.com/auth/verify-email');
  });

  it('uses resolveApiUrl as an escape hatch, skipping discovery', async () => {
    const fetchMock = createFetchMock(jsonResponse({ body: { verified: true } }));
    const client = createClient({
      resolveApiUrl: () => 'http://localhost:3000',
      fetch: fetchMock,
    });

    await client.auth.verifyEmail({ token: 't' });

    expect(fetchMock.callCount).toBe(1);
    expect(fetchMock.calls[0]?.url).toBe('http://localhost:3000/auth/verify-email');
  });
});
