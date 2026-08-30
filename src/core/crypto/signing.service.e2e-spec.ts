import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfigService } from '../config/config.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { SecretBox } from './secret-box.js';
import { SigningService } from './signing.service.js';

describe('SigningService (integration)', () => {
  let database: TestDatabase;
  let service: SigningService;
  let overlapSeconds = 604_800;

  const config = {
    get: (key: string) => {
      if (key === 'signing.key_overlap_seconds') return overlapSeconds;
      throw new Error(`unexpected config key ${key}`);
    },
  } as unknown as ConfigService;

  beforeAll(async () => {
    database = await startTestDatabase();
    service = new SigningService(
      { orm: database.db.orm } as unknown as PrismaService,
      config,
      new SecretBox(randomBytes(32))
    );
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  beforeEach(async () => {
    overlapSeconds = 604_800;
    const rows = (await database.db.orm.public.ServerSigningKey.all()) as Array<{ id: string }>;
    for (const row of rows) {
      await database.db.orm.public.ServerSigningKey.where({ id: row.id }).delete();
    }
  });

  it('generates exactly one active key on first use', async () => {
    const key = await service.getActiveKey();
    expect(key.algorithm).toBe('ed25519');
    expect(key.id).toMatch(/^[0-9a-f]{16}$/);

    const again = await service.getActiveKey();
    expect(again.id).toBe(key.id);

    const rows = await database.db.orm.public.ServerSigningKey.all();
    expect(rows).toHaveLength(1);
  });

  it('signs with the active key and verifies', async () => {
    const message = Buffer.from('server-to-server payload');
    const { keyId, signature } = await service.sign(message);

    expect(await service.verify(keyId, message, signature)).toBe(true);
    expect(await service.verify(keyId, Buffer.from('tampered'), signature)).toBe(false);
    expect(await service.verify('unknown-key', message, signature)).toBe(false);
  });

  it('rotate() keeps the retired key verifiable and published within the overlap window', async () => {
    const message = Buffer.from('signed before rotation');
    const old = await service.sign(message);

    const next = await service.rotate();
    expect(next.id).not.toBe(old.keyId);

    // New signatures use the new key.
    const fresh = await service.sign(message);
    expect(fresh.keyId).toBe(next.id);

    // Old signature still verifies against the retired key.
    expect(await service.verify(old.keyId, message, old.signature)).toBe(true);

    const published = await service.listPublicKeys();
    expect(published.map((k) => k.id).sort()).toEqual([old.keyId, next.id].sort());
    const active = published.find((k) => k.id === next.id);
    const retired = published.find((k) => k.id === old.keyId);
    expect(active?.validUntil).toBeNull();
    expect(retired?.validUntil).toBeTypeOf('string');
  });

  it('sweepRetiredKeys() drops keys past the overlap window only', async () => {
    const old = await service.getActiveKey();
    await service.rotate();

    overlapSeconds = 604_800;
    expect(await service.sweepRetiredKeys()).toBe(0);
    expect((await service.listPublicKeys()).some((k) => k.id === old.id)).toBe(true);

    overlapSeconds = 0;
    expect(await service.sweepRetiredKeys()).toBe(1);
    expect((await service.listPublicKeys()).some((k) => k.id === old.id)).toBe(false);
    expect(await database.db.orm.public.ServerSigningKey.all()).toHaveLength(1);
  });
});
