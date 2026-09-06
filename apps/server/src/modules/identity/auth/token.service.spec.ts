import { describe, expect, it } from 'vitest';
import type { ConfigService } from '../../../core/config/config.service.js';
import {
  ed25519Sign,
  ed25519Verify,
  generateEd25519KeyPair,
  privateKeyFromDer,
  publicKeyFromBase64,
} from '../../../core/crypto/ed25519.js';
import type { SigningService } from '../../../core/crypto/signing.service.js';
import { UnauthenticatedError } from '../identity.errors.js';
import { TokenService } from './token.service.js';

const keyPair = generateEd25519KeyPair();
const privateKey = privateKeyFromDer(keyPair.privateKeyDer);
const publicKey = publicKeyFromBase64(keyPair.publicKeyBase64);

const signing = {
  getActiveKey: async () => ({
    id: 'k1',
    algorithm: 'ed25519',
    publicKey: keyPair.publicKeyBase64,
  }),
  sign: async (bytes: Uint8Array) => ({
    keyId: 'k1',
    algorithm: 'ed25519',
    signature: ed25519Sign(privateKey, bytes),
  }),
  verify: async (keyId: string, bytes: Uint8Array, sig: Uint8Array) =>
    keyId === 'k1' && ed25519Verify(publicKey, bytes, sig),
} as unknown as SigningService;

const config = {
  get: (key: string) => {
    if (key === 'auth.access_token_ttl') return 900;
    if (key === 'server.domain') return 'ekoz.example.com';
    throw new Error(`unexpected key ${key}`);
  },
} as unknown as ConfigService;

describe('TokenService (unit)', () => {
  const service = new TokenService(signing, config);

  it('issues a verifiable EdDSA access token', async () => {
    const { token, expiresIn } = await service.issueAccessToken({ userId: 'u1', sessionId: 's1' });
    expect(expiresIn).toBe(900);

    const claims = await service.verifyAccessToken(token);
    expect(claims).toMatchObject({ iss: 'ekoz.example.com', sub: 'u1', sid: 's1' });
  });

  it('rejects a tampered payload', async () => {
    const { token } = await service.issueAccessToken({ userId: 'u1', sessionId: 's1' });
    const [head, , sig] = token.split('.');
    const forged = `${head}.${Buffer.from(JSON.stringify({ iss: 'ekoz.example.com', sub: 'evil', sid: 's1', iat: 1, exp: 9_999_999_999 })).toString('base64url')}.${sig}`;
    await expect(service.verifyAccessToken(forged)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('rejects an expired token', async () => {
    const shortConfig = {
      get: (key: string) => (key === 'auth.access_token_ttl' ? -1 : 'ekoz.example.com'),
    } as unknown as ConfigService;
    const { token } = await new TokenService(signing, shortConfig).issueAccessToken({
      userId: 'u1',
      sessionId: 's1',
    });
    await expect(service.verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
