import type { EmailTemplate } from '../../../core/mail/templates/template.js';

/**
 * Identity email templates (technical.md §18). Registered into `MailService` by
 * {@link EmailVerificationService} on module init. `${verifyUrl}` /
 * `${displayName}` / `${newEmail}` are interpolated per send.
 */

export const EMAIL_VERIFICATION_TEMPLATE: EmailTemplate = {
  subject: 'Confirm your email address',
  text: [
    'Hi ${displayName},',
    '',
    'Confirm this email address to finish setting up your account:',
    '',
    '${verifyUrl}',
    '',
    'If you did not create an account, you can ignore this message.',
  ].join('\n'),
  html: [
    '<p>Hi ${displayName},</p>',
    '<p>Confirm this email address to finish setting up your account:</p>',
    '<p><a href="${verifyUrl}">Confirm email address</a></p>',
    '<p>If you did not create an account, you can ignore this message.</p>',
  ].join('\n'),
};

export const EMAIL_CHANGED_NOTICE_TEMPLATE: EmailTemplate = {
  subject: 'Your email address is being changed',
  text: [
    'Hi ${displayName},',
    '',
    'Someone requested to change the email address on your account to',
    '${newEmail}. The change takes effect once that address is confirmed.',
    '',
    'If this was not you, change your password immediately.',
  ].join('\n'),
  html: [
    '<p>Hi ${displayName},</p>',
    '<p>Someone requested to change the email address on your account to <strong>${newEmail}</strong>. ',
    'The change takes effect once that address is confirmed.</p>',
    '<p>If this was not you, change your password immediately.</p>',
  ].join('\n'),
};
