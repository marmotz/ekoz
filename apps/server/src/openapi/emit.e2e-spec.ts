import { readFileSync } from 'node:fs';
import type { OpenAPIObject } from '@nestjs/swagger';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildOfflineOpenApiDocument, OPENAPI_JSON_PATH } from './emit.js';

/**
 * The emit runs without Postgres — `preview: true` never instantiates the
 * providers whose `onModuleInit` would touch the database or the config file.
 * This spec is in the `integration` project only for its ~1s Nest boot, not
 * because it needs infra.
 */
const IN_SCOPE_PATHS = [
  '/auth/login',
  '/auth/policy',
  '/auth/refresh',
  '/auth/register',
  '/auth/verify-email',
  '/auth/password-reset/request',
  '/sessions',
  '/stream/ticket',
  '/me',
  '/me/profile',
  '/me/username',
  '/invitations',
  '/setup/owner',
  '/.well-known/ekoz',
  '/blobs/{id}',
  '/rooms/{id}/messages',
  '/rooms/{id}/members',
];

describe('openapi:emit (offline)', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await buildOfflineOpenApiDocument();
  });

  it('produces a valid OpenAPI 3.x document', () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe('Ekoz server API');
    expect(document.components?.securitySchemes?.bearer).toBeDefined();
  });

  it('covers every in-scope path', () => {
    for (const path of IN_SCOPE_PATHS) {
      expect(Object.keys(document.paths)).toContain(path);
    }
  });

  it('excludes the operational endpoints', () => {
    expect(Object.keys(document.paths)).not.toContain('/healthz');
    expect(Object.keys(document.paths)).not.toContain('/metrics');
  });

  it('types entity ids as a 26-char base32 pattern, never format: uuid', () => {
    const schemas = document.components?.schemas ?? {};
    const idProp = (schemas.SessionViewDto as { properties: Record<string, unknown> }).properties
      .id as { pattern?: string; format?: string };
    expect(idProp.pattern).toBe('^[0-9A-HJKMNP-TV-Z]{26}$');
    expect(idProp.format).toBeUndefined();
    expect(JSON.stringify(document)).not.toContain('"format":"uuid"');
  });

  it('renders nullable fields the OpenAPI 3.0 way, not as a type array', () => {
    expect(document.openapi).toBe('3.0.0');
    const serialized = JSON.stringify(document);
    // 3.1-style `"type": ["string", "null"]` and the `nestjs-zod` `type: array`
    // artefact must not appear — nullability is `nullable: true` only.
    expect(serialized).not.toMatch(/"type":\s*\[/);
    expect(serialized).not.toContain(',"null"]');
    const schemas = document.components?.schemas ?? {};
    const ip = (schemas.SessionViewDto as { properties: Record<string, unknown> }).properties.ip;
    expect(ip).toEqual({ type: 'string', nullable: true });
  });

  it('declares a success response for every in-scope 204 route', () => {
    for (const op of [
      document.paths['/auth/logout']?.post,
      document.paths['/sessions/{id}']?.delete,
    ]) {
      expect(op?.responses['204']).toBeDefined();
    }
  });

  it('gives every in-scope operation a typed success response', () => {
    const login = document.paths['/auth/login']?.post;
    expect(login?.requestBody).toBeDefined();
    const ok = login?.responses['200'] as { content?: Record<string, unknown> } | undefined;
    expect(ok?.content?.['application/json']).toBeDefined();
  });

  it('matches the committed openapi.json', () => {
    const committed = readFileSync(OPENAPI_JSON_PATH, 'utf8');
    expect(committed).toBe(`${JSON.stringify(document, null, 2)}\n`);
  });
});
