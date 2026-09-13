/**
 * Opt-in end-to-end run against a real reference server (technical.md §13).
 * Skipped unless `EKOZ_TEST_SERVER` is set — see `README.md` in this folder.
 */

import { describe, expect, it } from 'vitest';
import { createClient } from '../../src/client.js';

const baseUrl = process.env.EKOZ_TEST_SERVER;

describe.skipIf(!baseUrl)('identity flow (integration)', () => {
  it('setup/owner -> login -> me -> forced refresh -> sessions.list -> logout', async () => {
    const client = createClient({ resolveApiUrl: () => baseUrl! });

    const owner = await client.setup.createOwner({
      email: `owner-${Date.now()}@example.com`,
      password: 'a-strong-password-1',
      name: `owner${Date.now()}`,
      displayName: 'Integration Owner',
    });
    expect(owner.user.isOwner).toBe(true);

    await client.auth.logout();

    const login = await client.auth.login({
      identifier: owner.user.identifier!,
      password: 'a-strong-password-1',
    });
    expect(login.session.id).toBeTruthy();

    const me = await client.me.get();
    expect(me.identifier).toBe(owner.user.identifier);

    await client.session.resume();
    const sessions = await client.sessions.list();
    expect(sessions.length).toBeGreaterThan(0);

    const invitation = await client.invitations.create({});
    expect(invitation.token).toBeTruthy();

    await client.auth.logout();
    expect(client.session.getState()).toBeUndefined();
  });
});
