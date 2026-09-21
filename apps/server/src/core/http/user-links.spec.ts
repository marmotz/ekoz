import { describe, expect, it } from 'vitest';
import { avatarUrl, userIdentifier } from './user-links.js';

describe('user-links (unit)', () => {
  describe('avatarUrl', () => {
    it('builds the versioned avatar URL', () => {
      expect(avatarUrl('https://api.ekoz.example.com', 'alice', '01HXBLOB')).toBe(
        'https://api.ekoz.example.com/users/alice/avatar?v=01HXBLOB',
      );
    });

    it('encodes the name and the version', () => {
      expect(avatarUrl('https://api.ekoz.example.com', 'a b/c', 'v 1&x=2')).toBe(
        'https://api.ekoz.example.com/users/a%20b%2Fc/avatar?v=v%201%26x%3D2',
      );
    });

    it('changes with the blob id and stays equal for the same one', () => {
      const first = avatarUrl('https://api.example.com', 'alice', 'blob-1');
      expect(avatarUrl('https://api.example.com', 'alice', 'blob-1')).toBe(first);
      expect(avatarUrl('https://api.example.com', 'alice', 'blob-2')).not.toBe(first);
    });
  });

  describe('userIdentifier', () => {
    it('joins the name and the server domain', () => {
      expect(userIdentifier('alice', 'ekoz.example.com')).toBe('alice/ekoz.example.com');
    });
  });
});
