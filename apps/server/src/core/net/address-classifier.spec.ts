import { describe, expect, it } from 'vitest';
import { isPublicAddress } from './address-classifier.js';

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['1.1.1.1', true],
    ['93.184.216.34', true],
    ['127.0.0.1', false],
    ['127.5.5.5', false],
    ['10.0.0.1', false],
    ['172.16.0.1', false],
    ['172.31.255.255', false],
    ['172.32.0.1', true],
    ['192.168.1.1', false],
    ['100.64.0.1', false],
    ['100.127.255.255', false],
    ['100.63.255.255', true],
    ['169.254.169.254', false], // cloud metadata address
    ['169.254.0.1', false],
    ['224.0.0.1', false], // multicast
    ['255.255.255.255', false],
    ['0.0.0.0', false],
  ])('classifies IPv4 %s as public=%s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  it.each([
    ['2001:4860:4860::8888', true], // Google public DNS
    ['::1', false],
    ['::', false],
    ['fe80::1', false], // link-local
    ['fc00::1', false], // ULA
    ['fd12:3456::1', false], // ULA
    ['ff02::1', false], // multicast
  ])('classifies IPv6 %s as public=%s', (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  it('unwraps an IPv4-mapped IPv6 address and classifies it as IPv4', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
  });

  it('refuses a non-IP hostname', () => {
    expect(isPublicAddress('not-an-ip')).toBe(false);
  });
});
