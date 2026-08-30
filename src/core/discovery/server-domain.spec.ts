import { describe, expect, it } from 'vitest';
import { assertValidServerDomain, isValidServerDomain } from './server-domain.js';

describe('server domain validation (unit)', () => {
  it.each(['chat.example', 'ekoz.example.com', 'my-server.co.uk', 'a.io'])('accepts %s', (domain) => {
    expect(isValidServerDomain(domain)).toBe(true);
  });

  it.each([
    'localhost',
    'server', // bare hostname
    'UPPER.example.com', // not lower-cased
    '192.168.1.10', // IPv4 literal
    '2001:db8::1', // IPv6 literal
    'trailing.dot.', // trailing dot
    'bad_underscore.com', // invalid label char
    'example.123', // numeric TLD
  ])('rejects %s', (domain) => {
    expect(isValidServerDomain(domain)).toBe(false);
  });

  it('assertValidServerDomain throws with the offending value', () => {
    expect(() => assertValidServerDomain('localhost')).toThrow(/localhost/);
  });
});
