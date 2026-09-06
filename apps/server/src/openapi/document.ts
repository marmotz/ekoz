import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { PROTOCOL_VERSIONS } from '../core/discovery/discovery.service.js';

const BEARER_SCHEME = 'bearer';

function packageVersion(): string {
  const path = fileURLToPath(new URL('../../package.json', import.meta.url));
  return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version;
}

/**
 * Builds the OpenAPI description of the server HTTP API from the controller and
 * `createZodDto` decorators. Shared by the live `/docs` endpoint
 * ([`main.ts`](../main.ts)) and the committed-artefact emitter
 * ([`openapi/emit.ts`](./emit.ts)) so both produce the exact same document.
 *
 * `nestjs-zod@5` teaches `@nestjs/swagger` to read Zod schemas without an
 * explicit `patchNestJsSwagger()` call; `cleanupOpenApiDoc` strips the
 * intermediate artefacts from the result.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Ekoz server API')
    .setDescription(
      'HTTP API of the Ekoz reference server, consumed by `@ekozhq/sdk`. ' +
        'Errors use `application/problem+json` (RFC 9457).',
    )
    .setVersion(packageVersion())
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_SCHEME)
    .addServer('/', `Ekoz protocol version(s): ${PROTOCOL_VERSIONS.join(', ')}`)
    .build();

  const document = SwaggerModule.createDocument(app, config);
  return cleanupOpenApiDoc(document);
}

export { BEARER_SCHEME };
