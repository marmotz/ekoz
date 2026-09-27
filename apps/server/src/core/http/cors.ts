import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * CORS options for the console / `client-web` origins (technical.md §2.5).
 * `null` when the allow-list is empty, meaning CORS stays off — the current
 * behaviour. No `credentials: true`: the SDK only ever sends a bearer token,
 * never a cookie.
 */
export function buildCorsOptions(allowedOrigins: readonly string[]): CorsOptions | null {
  if (allowedOrigins.length === 0) {
    return null;
  }

  return {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'authorization',
      'content-type',
      'x-request-id',
      'x-ekoz-protocol',
      'upload-length',
      'upload-metadata',
      'upload-offset',
      'tus-resumable',
    ],
    exposedHeaders: [
      'x-request-id',
      'location',
      'upload-offset',
      'upload-length',
      'upload-expires',
      'ekoz-upload',
      'tus-resumable',
      'tus-version',
      'tus-extension',
      'tus-max-size',
    ],
    maxAge: 600,
  };
}
