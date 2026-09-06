import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ConfigService } from '../config/config.service.js';
import { MetricsService } from '../observability/metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MAIL_TEMPLATE_STORE,
  MAILER,
  type Mailer,
  type MailTemplateStore,
  type OutboundEmail,
  type SendEmailArgs,
} from './mailer.js';
import { renderTemplate, type EmailTemplate } from './templates/template.js';

interface EmailMessageRow {
  id: string;
  to: string;
  template: string;
  category: string;
  dedupeKey: string | null;
  sentAt: string | null;
}

/** Delivery attempts before the message is declared failed (technical.md §7). */
const MAX_ATTEMPTS = 4;

/**
 * Outbound email orchestration (technical.md §7): template rendering, the
 * `email_message` record with its coarse `dedupeKey` guard, and an in-process
 * retry queue with exponential backoff. After {@link MAX_ATTEMPTS} failures the
 * message is logged and an `email.failed` audit entry is written. No external
 * broker.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templates = new Map<string, EmailTemplate>();
  private pending = 0;
  /** Resolves whenever the retry queue drains — used by tests. */
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly metrics: MetricsService,
    @Optional() @Inject(MAIL_TEMPLATE_STORE) private readonly templateOverrides: MailTemplateStore | null = null
  ) {}

  /** Register a template under `name`. Called by the feature that owns it on init. */
  registerTemplate(name: string, template: EmailTemplate): void {
    this.templates.set(name, template);
  }

  /**
   * Effective template for `name`: the registered default, with any owner
   * override merged over it field by field (technical.md §7). The override store
   * is unbound today, so this returns the registered default unchanged.
   */
  private async resolveTemplate(name: string): Promise<EmailTemplate> {
    const base = this.templates.get(name);
    if (!base) {
      throw new Error(`unknown email template "${name}"`);
    }

    const override = await this.templateOverrides?.resolve(name);
    if (!override) {
      return base;
    }

    return {
      subject: override.subject ?? base.subject,
      text: override.text ?? base.text,
      html: override.html ?? base.html,
    };
  }

  /**
   * Queue `args` for delivery. The first attempt runs inline; failures are
   * retried in the background with backoff, so the caller is never blocked past
   * one attempt.
   */
  async send(args: SendEmailArgs): Promise<void> {
    const template = await this.resolveTemplate(args.template);

    if (args.dedupeKey) {
      const prior = (await this.prisma.orm.public.EmailMessage.where({
        dedupeKey: args.dedupeKey,
      }).first()) as EmailMessageRow | null;
      if (prior) {
        this.logger.debug(`Skipping duplicate email (dedupeKey=${args.dedupeKey})`);

        return;
      }
    }

    const row = (await this.prisma.orm.public.EmailMessage.create({
      to: args.to,
      template: args.template,
      category: args.category,
      dedupeKey: args.dedupeKey ?? null,
    })) as EmailMessageRow;

    const message: OutboundEmail = {
      to: args.to,
      ...renderTemplate(template, args.vars, {
        domain: this.config.get('server.domain'),
        webUrl: this.config.get('server.web_url'),
      }),
    };

    await this.attempt(row, message, 1);
  }

  /** Resolves once no retries are in flight (test helper). */
  async onIdle(): Promise<void> {
    if (this.pending === 0) {
      return;
    }

    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  private async attempt(row: EmailMessageRow, message: OutboundEmail, attempt: number): Promise<void> {
    this.metrics.recordEmailSendAttempt();
    try {
      await this.mailer.send(message);
      await this.prisma.orm.public.EmailMessage.where({ id: row.id }).update({
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      await this.onAttemptFailed(row, message, attempt, error as Error);
    }
  }

  private async onAttemptFailed(
    row: EmailMessageRow,
    message: OutboundEmail,
    attempt: number,
    error: Error
  ): Promise<void> {
    this.metrics.recordEmailSendFailure();

    if (attempt >= MAX_ATTEMPTS) {
      this.logger.error(`Email to ${row.to} (${row.template}) failed after ${attempt} attempts: ${error.message}`);
      await this.audit.record({
        action: 'email.failed',
        targetType: 'email_message',
        targetId: row.id,
        actorUserId: null,
        metadata: { template: row.template, category: row.category, attempts: attempt, error: error.message },
      });

      return;
    }

    this.logger.warn(`Email to ${row.to} attempt ${attempt} failed: ${error.message}; retrying`);
    const delay = this.config.get('email.retry_base_ms') * 2 ** (attempt - 1);
    this.pending += 1;
    this.metrics.setEmailQueueDepth(this.pending);
    const timer = setTimeout(() => {
      void this.attempt(row, message, attempt + 1).finally(() => {
        this.pending -= 1;
        this.metrics.setEmailQueueDepth(this.pending);
        if (this.pending === 0) {
          this.idleWaiters.splice(0).forEach((resolve) => resolve());
        }
      });
    }, delay);
    timer.unref?.();
  }
}
