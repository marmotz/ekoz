import type { INestApplication } from '@nestjs/common';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { ApiBody, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiProblemResponses } from '../core/http/api-problem-responses.decorator.js';
import { buildOpenApiDocument } from './document.js';

class LoginProbeDto extends createZodDto(
  z.object({ identifier: z.string(), password: z.string() }),
) {}

@Controller('auth')
class LoginProbeController {
  @Post('login')
  @ApiBody({ type: LoginProbeDto })
  @ApiProblemResponses({ validation: true, statuses: [401] })
  login(@Body() body: LoginProbeDto): { ok: true; body: LoginProbeDto } {
    return { ok: true, body };
  }
}

@Module({ controllers: [LoginProbeController] })
class ProbeModule {}

describe('OpenAPI exposure (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [ProbeModule] }).compile()
    ).createNestApplication();
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app), { jsonDocumentUrl: 'docs/json' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves the OpenAPI JSON at /docs/json', async () => {
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toContain('/auth/login');
    expect(res.body.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(res.body.components.schemas.ProblemDetailsDto).toBeDefined();
    expect(
      res.body.paths['/auth/login'].post.requestBody.content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/LoginProbeDto' });
    expect(
      res.body.paths['/auth/login'].post.responses['401'].content['application/problem+json']
        .schema,
    ).toEqual({ $ref: '#/components/schemas/ProblemDetailsDto' });
  });

  it('serves the Swagger UI at /docs', async () => {
    const res = await request(app.getHttpServer()).get('/docs').expect(200);
    expect(res.text).toContain('Swagger UI');
  });
});
