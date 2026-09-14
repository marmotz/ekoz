import { describe, expect, it } from 'vitest';
import { buildCorsOptions } from './cors.js';

describe('buildCorsOptions (unit)', () => {
  it('returns null when the allow-list is empty (CORS stays off)', () => {
    expect(buildCorsOptions([])).toBeNull();
  });

  it('builds an allow-list CorsOptions with no credentials', () => {
    const options = buildCorsOptions([
      'https://admin.ekoz.example.com',
      'https://app.ekoz.example.com',
    ]);
    expect(options).toMatchObject({
      origin: ['https://admin.ekoz.example.com', 'https://app.ekoz.example.com'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    });
    expect(options).not.toHaveProperty('credentials');
  });
});
