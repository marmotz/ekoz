import type { INestApplication } from '@nestjs/common';
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ObservabilityModule } from '../observability/observability.module.js';
import { DomainError } from './domain-error.js';
import { HttpModule } from './http.module.js';
import { Public } from './public.decorator.js';
import { getRequestId } from './request-context.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const CreateThingSchema = z.object({ name: z.string().min(1) });

@Controller('things')
class ThingsController {
  @Get('ok')
  @Public()
  ok(): { requestId: string | undefined } {
    return { requestId: getRequestId() };
  }

  @Get('boom')
  boom(): never {
    throw new DomainError('things.exploded', 'The thing exploded.', 409);
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret-stacktrace-detail');
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateThingSchema)) body: z.infer<typeof CreateThingSchema>): {
    name: string;
  } {
    return { name: body.name };
  }
}

@Module({ imports: [ObservabilityModule, HttpModule], controllers: [ThingsController] })
class TestAppModule {}

describe('HTTP conventions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('generates and echoes an X-Request-Id when none is sent', async () => {
    const res = await request(app.getHttpServer()).get('/things/ok').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('echoes a client-supplied X-Request-Id', async () => {
    const res = await request(app.getHttpServer())
      .get('/things/ok')
      .set('X-Request-Id', 'client-abc')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('client-abc');
    expect(res.body.requestId).toBe('client-abc');
  });

  it('renders a DomainError as application/problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/things/boom').expect(409);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      code: 'things.exploded',
      status: 409,
      detail: 'The thing exploded.',
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('hides unexpected errors behind internal_error 500', async () => {
    const res = await request(app.getHttpServer()).get('/things/crash').expect(500);
    expect(res.body).toMatchObject({ code: 'internal_error' });
    expect(JSON.stringify(res.body)).not.toContain('secret-stacktrace-detail');
  });

  it('rejects invalid bodies with 422 validation_failed and an errors array', async () => {
    const res = await request(app.getHttpServer()).post('/things').send({ name: '' }).expect(422);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.errors[0].path).toBe('body.name');
  });

  it('accepts a valid body and returns the parsed value', async () => {
    await request(app.getHttpServer())
      .post('/things')
      .send({ name: 'widget' })
      .expect(201)
      .expect({ name: 'widget' });
  });

  it('maps an unknown route to a not_found problem', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body.code).toBe('not_found');
  });
});
