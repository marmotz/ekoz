import { describe, expect, it } from 'vitest';
import {
  type AccessTokenClaims,
  assembleToken,
  base64UrlEncode,
  type JwtHeader,
  parseToken,
  signingInput,
} from './jwt.js';

const header: JwtHeader = { alg: 'EdDSA', typ: 'JWT', kid: 'key-1' };
const claims: AccessTokenClaims = {
  iss: 'ekoz.example.com',
  sub: 'user-1',
  sid: 'session-1',
  iat: 1_000,
  exp: 2_000,
};

describe('compact JWS helpers (unit)', () => {
  it('round-trips header + claims through assemble / parse', () => {
    const input = signingInput(header, claims);
    const token = assembleToken(input, Buffer.from('signature-bytes'));

    const parsed = parseToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.header).toEqual(header);
    expect(parsed!.claims).toEqual(claims);
    expect(parsed!.signingInput).toBe(input);
    expect(parsed!.signature.toString()).toBe('signature-bytes');
  });

  it('rejects a token without three segments', () => {
    expect(parseToken('a.b')).toBeNull();
  });

  it('rejects a non-EdDSA header', () => {
    const bad = `${base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'k' }))}.${base64UrlEncode(
      JSON.stringify(claims),
    )}.sig`;
    expect(parseToken(bad)).toBeNull();
  });

  it('rejects claims missing sub / sid / exp', () => {
    const bad = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify({ iss: 'x' }))}.sig`;
    expect(parseToken(bad)).toBeNull();
  });
});
