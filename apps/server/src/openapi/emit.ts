import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import 'reflect-metadata';
import { AppModule } from '../app.module.js';
import { buildOpenApiDocument } from './document.js';

export const OPENAPI_JSON_PATH = fileURLToPath(new URL('../../openapi.json', import.meta.url));

/**
 * Builds the OpenAPI document from `AppModule` offline: `preview: true`
 * instantiates controllers without their providers, so no module
 * `onModuleInit` runs — no database, no config load, no network.
 */
export async function buildOfflineOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

/**
 * Regenerates the committed `apps/server/openapi.json`. Run by
 * `bun run openapi:emit`; CI diffs the result to catch drift (issue #48).
 */
export async function emit(): Promise<void> {
  const document = await buildOfflineOpenApiDocument();
  writeFileSync(OPENAPI_JSON_PATH, `${JSON.stringify(document, null, 2)}\n`);
  process.stdout.write(`openapi.json written (${Object.keys(document.paths).length} paths)\n`);
}

if (import.meta.main) {
  await emit();
}
