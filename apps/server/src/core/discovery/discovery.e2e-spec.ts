import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { applyTestInfraConfig } from '../config/testing/test-infra-config.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';

describe('GET /.well-known/ekoz (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
  }, 180_000);

  afterAll(async () => {
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('serves the discovery document, unauthenticated and cacheable', async () => {
    const res = await request(app.getHttpServer()).get('/.well-known/ekoz').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.body.server).toBe('ekoz.example.com');
    expect(res.body.api).toBe('https://api.ekoz.example.com');
    expect(res.body.web).toBe('https://app.ekoz.example.com');
    expect(res.body.protocol_versions).toEqual(['0']);

    const keyIds = Object.keys(res.body.signing_keys);
    expect(keyIds).toHaveLength(1);
    const key = res.body.signing_keys[keyIds[0]!];
    expect(Buffer.from(key.public_key, 'base64')).toHaveLength(32);
    expect(key.valid_from).toBeTypeOf('string');
    expect(key.valid_until).toBeNull();
  });

  it('pins the server identity so the discovery server matches config', async () => {
    const res = await request(app.getHttpServer()).get('/.well-known/ekoz').expect(200);
    const identity = await database.db.orm.public.ServerIdentity.where({ id: 'server' }).first();
    expect((identity as { domain: string }).domain).toBe(res.body.server);
  });
});
