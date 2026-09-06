import type { EmailTemplate } from '../../../core/mail/templates/template.js';

/**
 * Account email templates (technical.md §18). Registered into `MailService` by
 * {@link PasswordResetService} on module init. `${resetUrl}` / `${displayName}`
 * are interpolated per send.
 */
export const PASSWORD_RESET_TEMPLATE: EmailTemplate = {
  subject: 'Reset your password',
  text: [
    'Hi ${displayName},',
    '',
    'Someone asked to reset the password on your account. Follow this link to',
    'choose a new one — it expires in one hour:',
    '',
    '${resetUrl}',
    '',
    'If this was not you, you can ignore this message; your password stays unchanged.',
  ].join('\n'),
  html: [
    '<p>Hi ${displayName},</p>',
    '<p>Someone asked to reset the password on your account. Follow this link to ',
    'choose a new one — it expires in one hour:</p>',
    '<p><a href="${resetUrl}">Reset password</a></p>',
    '<p>If this was not you, you can ignore this message; your password stays unchanged.</p>',
  ].join('\n'),
};
