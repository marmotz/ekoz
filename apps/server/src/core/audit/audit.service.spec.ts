import { describe, expect, it, vi } from 'vitest';
import { runWithRequestContext } from '../http/request-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

function prismaStub(): { prisma: PrismaService; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn().mockResolvedValue(undefined);
  const prisma = { orm: { public: { AuditLog: { create } } } } as unknown as PrismaService;
  return { prisma, create };
}

describe('AuditService (unit)', () => {
  it('fills actor and IP from the ambient request context', async () => {
    const { prisma, create } = prismaStub();
    const service = new AuditService(prisma);

    await runWithRequestContext({ requestId: 'r1', clientIp: '203.0.113.7', userId: 'user-1' }, () =>
      service.record({ action: 'identity.user_logged_in' })
    );

    expect(create).toHaveBeenCalledWith({
      action: 'identity.user_logged_in',
      actorUserId: 'user-1',
      actorIp: '203.0.113.7',
      targetType: null,
      targetId: null,
      metadata: {},
    });
  });

  it('records a system action (no context, no actor)', async () => {
    const { prisma, create } = prismaStub();
    await new AuditService(prisma).record({ action: 'server.started', metadata: { version: '1.2.3' } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: null, actorIp: null, metadata: { version: '1.2.3' } })
    );
  });

  it('lets an explicit null actor override the context', async () => {
    const { prisma, create } = prismaStub();
    const service = new AuditService(prisma);
    await runWithRequestContext({ requestId: 'r2', userId: 'user-9' }, () =>
      service.record({ action: 'admin.impersonation', actorUserId: null })
    );
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: null }));
  });

  it('passes target coordinates through', async () => {
    const { prisma, create } = prismaStub();
    await new AuditService(prisma).record({ action: 'blob.deleted', targetType: 'blob', targetId: 'blb_1' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'blob', targetId: 'blb_1' }));
  });
});
