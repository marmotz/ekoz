import { describe, expect, it } from 'vitest';
import { FileUrlSigner } from './file-url-token.js';

const SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
const now = () => Math.floor(Date.now() / 1000);

describe('FileUrlSigner', () => {
  it('round-trips a signed token', () => {
    const signer = new FileUrlSigner(SECRET_KEY);
    const token = signer.sign({
      kind: 'attachment',
      id: 'att_1',
      variant: 'original',
      userId: 'alice',
      exp: now() + 3600,
    });

    const claims = signer.verify(token);
    expect(claims).toMatchObject({
      kind: 'attachment',
      id: 'att_1',
      variant: 'original',
      userId: 'alice',
    });
  });

  it('rejects a token signed with a different key', () => {
    const signer = new FileUrlSigner(SECRET_KEY);
    const other = new FileUrlSigner(Buffer.alloc(32, 9).toString('base64'));
    const token = other.sign({
      kind: 'preview',
      id: 'p1',
      variant: '',
      userId: 'bob',
      exp: now() + 60,
    });

    expect(signer.verify(token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const signer = new FileUrlSigner(SECRET_KEY);
    const token = signer.sign({
      kind: 'preview',
      id: 'p1',
      variant: '',
      userId: 'bob',
      exp: now() + 60,
    });
    const [payload, signature] = token.split('.') as [string, string];
    const tamperedPayload = Buffer.from(
      Buffer.from(payload, 'base64url').toString('utf8').replace('bob', 'eve'),
      'utf8',
    ).toString('base64url');

    expect(signer.verify(`${tamperedPayload}.${signature}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const signer = new FileUrlSigner(SECRET_KEY);
    const token = signer.sign({
      kind: 'message_preview',
      id: 'm1',
      variant: '',
      userId: 'carol',
      exp: now() - 1,
    });

    expect(signer.verify(token)).toBeNull();
  });

  it('rejects a malformed token', () => {
    const signer = new FileUrlSigner(SECRET_KEY);
    expect(signer.verify('not-a-token')).toBeNull();
    expect(signer.verify('')).toBeNull();
    expect(signer.verify('abc.def')).toBeNull();
  });
});
