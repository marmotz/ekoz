import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { AccountService } from '../../modules/identity/accounts/account.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { applyTestInfraConfig } from './testing/test-infra-config.js';

/** `GET/PUT/DELETE /admin/settings` (technical.md §2, issue #145). */
describe('admin settings (integration)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  let restoreConfig: () => void;
  let prisma: PrismaService;
  let ownerToken: string;
  let memberToken: string;

  const password = 'a-perfectly-fine-passphrase';
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.url;
    restoreConfig = applyTestInfraConfig({ databaseUrl: database.url });
    // Locks `attachments.max_per_message` for the `config.locked` case.
    process.env.EKOZ_ATTACHMENTS__MAX_PER_MESSAGE = '3';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();

    prisma = app.get(PrismaService);
    const accounts = app.get(AccountService);
    await accounts.createAccount({
      name: 'owner',
      email: 'owner@ekoz.example.com',
      password,
      displayName: 'The Owner',
      isOwner: true,
      emailVerified: true,
    });
    await accounts.createAccount({
      name: 'member',
      email: 'member@ekoz.example.com',
      password,
      displayName: 'Member',
      emailVerified: true,
    });

    ownerToken = (
      await request(server())
        .post('/auth/login')
        .send({ identifier: 'owner', password })
        .expect(200)
    ).body.accessToken;
    memberToken = (
      await request(server())
        .post('/auth/login')
        .send({ identifier: 'member', password })
        .expect(200)
    ).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    delete process.env.EKOZ_ATTACHMENTS__MAX_PER_MESSAGE;
    restoreConfig?.();
    await app?.close();
    await database?.stop();
  });

  it('refuses a non-owner', async () => {
    const res = await request(server())
      .get('/admin/settings')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    expect(res.body.code).toBe('auth.forbidden');
  });

  it('lists every parameter, masking secrets and reporting the locked key', async () => {
    const res = await request(server())
      .get('/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const byKey = new Map(res.body.map((p: { key: string }) => [p.key, p]));

    const secretKey = byKey.get('secret.key') as { value: string; secret: boolean } | undefined;
    expect(secretKey?.secret).toBe(true);
    expect(secretKey?.value).toBe('[secret]');

    const locked = byKey.get('attachments.max_per_message') as
      | { value: number; locked: boolean; source: string }
      | undefined;
    expect(locked?.locked).toBe(true);
    expect(locked?.source).toBe('env');
    expect(locked?.value).toBe(3);

    const runtime = byKey.get('messages.max_page') as { kind: string; hotReloadable: boolean };
    expect(runtime.kind).toBe('runtime');
    expect(runtime.hotReloadable).toBe(true);
  });

  it('sets a runtime override, visible immediately, and audits the change', async () => {
    const set = await request(server())
      .put('/admin/settings/messages.max_page')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: 5 })
      .expect(200);
    expect(set.body).toMatchObject({ key: 'messages.max_page', value: 5, source: 'settings' });

    const listed = await request(server())
      .get('/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const row = listed.body.find((p: { key: string }) => p.key === 'messages.max_page');
    expect(row.value).toBe(5);
    expect(row.source).toBe('settings');

    const audit = (await prisma.orm.public.AuditLog.where({
      action: 'config.setting_changed',
      targetId: 'messages.max_page',
    })
      .orderBy((f) => f.at.desc())
      .limit(1)
      .all()) as unknown as Array<{ metadata: { oldValue: unknown; newValue: unknown } }>;
    expect(audit[0]?.metadata).toEqual({ oldValue: 100, newValue: 5 });
  });

  it('reverts an override on delete', async () => {
    await request(server())
      .put('/admin/settings/messages.max_page')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: 7 })
      .expect(200);

    await request(server())
      .delete('/admin/settings/messages.max_page')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const listed = await request(server())
      .get('/admin/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const row = listed.body.find((p: { key: string }) => p.key === 'messages.max_page');
    expect(row.value).toBe(100);
    expect(row.source).toBe('default');
  });

  it('refuses to set an infra parameter', async () => {
    const res = await request(server())
      .put('/admin/settings/server.domain')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: 'other.example.com' })
      .expect(409);
    expect(res.body.code).toBe('config.not_runtime');
  });

  it('refuses to set a locked (env-overridden) key', async () => {
    const res = await request(server())
      .put('/admin/settings/attachments.max_per_message')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: 4 })
      .expect(409);
    expect(res.body.code).toBe('config.locked');
  });

  it('rejects an invalid value', async () => {
    const res = await request(server())
      .put('/admin/settings/messages.max_page')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: 'not-a-number' })
      .expect(422);
    expect(res.body.code).toBe('config.invalid_value');
  });

  it('rejects an unknown key', async () => {
    const res = await request(server())
      .put('/admin/settings/not.a.real.key')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ value: 1 })
      .expect(422);
    expect(res.body.code).toBe('config.unknown_key');
  });
});
