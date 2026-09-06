import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { ConfigService } from '../config/config.service.js';
import type { MetricsService } from '../observability/metrics.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from './mail.service.js';
import type { Mailer } from './mailer.js';

interface Row {
  id: string;
  to: string;
  template: string;
  category: string;
  dedupeKey: string | null;
  sentAt: string | null;
}

function fakes() {
  const rows: Row[] = [];
  let seq = 0;
  const EmailMessage = {
    where(filter: Partial<Row>) {
      const match = (r: Row) =>
        Object.entries(filter).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v);

      return {
        first: async () => rows.find(match) ?? null,
        update: async (patch: Partial<Row>) => {
          const r = rows.find(match);
          if (r) Object.assign(r, patch);
        },
      };
    },
    create: async (data: Omit<Row, 'id' | 'sentAt'>) => {
      const row: Row = { id: `em_${++seq}`, sentAt: null, ...data };
      rows.push(row);

      return row;
    },
  };
  const prisma = { orm: { public: { EmailMessage } } } as unknown as PrismaService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const metrics = {
    recordEmailSendAttempt: vi.fn(),
    recordEmailSendFailure: vi.fn(),
    setEmailQueueDepth: vi.fn(),
  } as unknown as MetricsService;
  const config = {
    get: (key: string) =>
      ({ 'server.domain': 'chat.example', 'server.web_url': 'https://chat.example', 'email.retry_base_ms': 1 })[key],
  } as unknown as ConfigService;

  return { rows, prisma, audit, metrics, config };
}

const template = { subject: 'Hi ${name}', text: 'Hello ${name}', html: '<b>${name}</b>' };

describe('MailService (unit)', () => {
  it('renders the template and marks the row sent on success', async () => {
    const f = fakes();
    const mailer: Mailer = { send: vi.fn().mockResolvedValue(undefined), verify: vi.fn() };
    const service = new MailService(f.prisma, f.config, f.audit, mailer, f.metrics);
    service.registerTemplate('greeting', template);

    await service.send({ to: 'a@b.co', template: 'greeting', vars: { name: 'Sam' }, category: 'test' });

    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.co', subject: 'Hi Sam', text: expect.stringContaining('Hello Sam') })
    );
    expect(f.rows[0]?.sentAt).toBeTypeOf('string');
  });

  it('throws for an unknown template', async () => {
    const f = fakes();
    const service = new MailService(f.prisma, f.config, f.audit, { send: vi.fn(), verify: vi.fn() }, f.metrics);
    await expect(service.send({ to: 'a@b.co', template: 'nope', vars: {}, category: 'x' })).rejects.toThrow(/unknown/);
  });

  it('merges an owner template override over the registered default', async () => {
    const f = fakes();
    const mailer: Mailer = { send: vi.fn().mockResolvedValue(undefined), verify: vi.fn() };
    const overrides = { resolve: vi.fn().mockResolvedValue({ subject: 'Bienvenue ${name}' }) };
    const service = new MailService(f.prisma, f.config, f.audit, mailer, f.metrics, overrides);
    service.registerTemplate('greeting', template);

    await service.send({ to: 'a@b.co', template: 'greeting', vars: { name: 'Sam' }, category: 'test' });

    expect(overrides.resolve).toHaveBeenCalledWith('greeting');
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Bienvenue Sam', text: expect.stringContaining('Hello Sam') })
    );
  });

  it('skips a duplicate when the dedupeKey was already used', async () => {
    const f = fakes();
    const mailer: Mailer = { send: vi.fn().mockResolvedValue(undefined), verify: vi.fn() };
    const service = new MailService(f.prisma, f.config, f.audit, mailer, f.metrics);
    service.registerTemplate('greeting', template);
    const args = { to: 'a@b.co', template: 'greeting', vars: { name: 'S' }, category: 'test', dedupeKey: 'k1' };

    await service.send(args);
    await service.send(args);

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(f.rows).toHaveLength(1);
  });

  it('retries with backoff and succeeds on a later attempt', async () => {
    const f = fakes();
    const send = vi.fn().mockRejectedValueOnce(new Error('greylisted')).mockResolvedValueOnce(undefined);
    const service = new MailService(f.prisma, f.config, f.audit, { send, verify: vi.fn() }, f.metrics);
    service.registerTemplate('greeting', template);

    await service.send({ to: 'a@b.co', template: 'greeting', vars: { name: 'S' }, category: 'test' });
    await service.onIdle();

    expect(send).toHaveBeenCalledTimes(2);
    expect(f.rows[0]?.sentAt).toBeTypeOf('string');
    expect(f.audit.record).not.toHaveBeenCalled();
  });

  it('records an email.failed audit entry after exhausting attempts', async () => {
    const f = fakes();
    const send = vi.fn().mockRejectedValue(new Error('relay down'));
    const service = new MailService(f.prisma, f.config, f.audit, { send, verify: vi.fn() }, f.metrics);
    service.registerTemplate('greeting', template);

    await service.send({ to: 'a@b.co', template: 'greeting', vars: { name: 'S' }, category: 'security' });
    await service.onIdle();

    expect(send).toHaveBeenCalledTimes(4);
    expect(f.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'email.failed', metadata: expect.objectContaining({ attempts: 4 }) })
    );
    expect(f.rows[0]?.sentAt).toBeNull();
  });
});
