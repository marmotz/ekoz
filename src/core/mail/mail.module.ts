import { Global, Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service.js';
import { MailService } from './mail.service.js';
import { MAILER, type Mailer } from './mailer.js';
import { SmtpMailer } from './smtp.mailer.js';

/**
 * Outbound email (technical.md §7): the configured {@link Mailer} transport
 * (only `smtp` exists) and {@link MailService}, which renders templates, records
 * `email_message` rows and runs the in-process retry queue.
 *
 * Global so features inject `MailService` (and register their own templates on
 * init) without re-importing.
 *
 * `MAIL_TEMPLATE_STORE` is intentionally left unbound: owner customization of
 * template wording / branding (technical.md §7) is delivered by
 * server-administration, which will bind a persistent store here. Until then
 * `MailService` uses the feature-registered templates as-is.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Mailer => {
        // `email.driver` only accepts `smtp` today (registry).
        config.get('email.driver');

        return new SmtpMailer(config);
      },
    },
    MailService,
  ],
  exports: [MailService, MAILER],
})
export class MailModule {}
