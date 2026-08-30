import { createTransport, type Transporter } from 'nodemailer';
import type { ConfigService } from '../config/config.service.js';
import type { Mailer, OutboundEmail } from './mailer.js';

/**
 * SMTP transport on `nodemailer` (technical.md §7), configured from
 * `email.smtp.*` and `email.from`. In local dev this points at the Mailpit
 * container from `compose.yaml`.
 */
export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get('email.smtp.user');
    const pass = config.get('email.smtp.pass');
    this.from = config.get('email.from');
    this.transporter = createTransport({
      host: config.get('email.smtp.host'),
      port: config.get('email.smtp.port'),
      secure: config.get('email.smtp.secure'),
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async send(message: OutboundEmail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}
