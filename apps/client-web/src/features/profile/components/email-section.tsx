import type { MeView } from '@ekozhq/sdk';
import { useChangeEmailDtoForm } from 'api/react-tanstack/ChangeEmailDto.form';
import { toast } from 'sonner';

import { SectionCard } from '@/features/profile/components/section-card';
import { useAccountError } from '@/features/profile/hooks/use-account-error';
import { useChangeEmail } from '@/features/profile/hooks/use-credentials';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { FormError, FormTextField } from '@/shared/ui/form-field';

const EMAIL_ERRORS = ['identity.email_taken'];
const PASSWORD_ERRORS = ['auth.invalid_credentials'];

function fieldError(
  errors: { code: string | null; message: string | null },
  codes: string[],
): string | undefined {
  return errors.code && codes.includes(errors.code) ? (errors.message ?? undefined) : undefined;
}

function formError(errors: { code: string | null; message: string | null }, ...codes: string[]) {
  return errors.code && codes.includes(errors.code) ? null : errors.message;
}

/**
 * Re-submits the pending address: the server replaces the stale verification and
 * sends the notice again. It needs the password like any email change.
 */
function ResendPending({ pendingEmail }: { pendingEmail: string }) {
  const { t } = useTranslation();
  const change = useChangeEmail();
  const errors = useAccountError();

  const form = useChangeEmailDtoForm({
    defaultValues: { newEmail: pendingEmail },
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        await change.mutateAsync({ newEmail: pendingEmail, password: value.password });
        toast.success(t('account.email.resent'));
        form.reset();
      } catch (error) {
        errors.apply(error);
      }
    },
  });

  return (
    <form
      noValidate
      className="space-y-3 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p className="text-sm">{t('account.email.pending', { email: pendingEmail })}</p>
      <form.Field name="password">
        {(field) => (
          <FormTextField
            field={field}
            id="resend-email-password"
            type="password"
            autoComplete="current-password"
            label={t('account.fields.currentPassword')}
            serverError={fieldError(errors, PASSWORD_ERRORS)}
          />
        )}
      </form.Field>
      <FormError>{formError(errors, ...PASSWORD_ERRORS)}</FormError>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            {t('account.email.resend')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

export function EmailSection({ me }: { me: MeView }) {
  const { t } = useTranslation();
  const change = useChangeEmail();
  const errors = useAccountError();

  const form = useChangeEmailDtoForm({
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        await change.mutateAsync({ newEmail: value.newEmail, password: value.password });
        toast.success(t('account.email.submitted', { email: value.newEmail }));
        form.reset();
      } catch (error) {
        errors.apply(error);
      }
    },
  });

  return (
    <SectionCard title={t('account.email.title')}>
      <p className="flex items-center gap-2 text-sm">
        <span>{me.email}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {me.emailVerified ? t('account.email.verified') : t('account.email.unverified')}
        </span>
      </p>
      {me.pendingEmail ? <ResendPending pendingEmail={me.pendingEmail} /> : null}
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="newEmail">
          {(field) => (
            <FormTextField
              field={field}
              id="change-email-address"
              type="email"
              autoComplete="email"
              label={t('account.fields.newEmail')}
              serverError={fieldError(errors, EMAIL_ERRORS)}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <FormTextField
              field={field}
              id="change-email-password"
              type="password"
              autoComplete="current-password"
              label={t('account.fields.currentPassword')}
              serverError={fieldError(errors, PASSWORD_ERRORS)}
            />
          )}
        </form.Field>
        <FormError>{formError(errors, ...EMAIL_ERRORS, ...PASSWORD_ERRORS)}</FormError>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {t('account.email.submit')}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionCard>
  );
}
