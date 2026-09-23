import { useChangePasswordDtoForm } from 'api/react-tanstack/ChangePasswordDto.form';
import { toast } from 'sonner';

import { SectionCard } from '@/features/profile/components/section-card';
import { useAccountError } from '@/features/profile/hooks/use-account-error';
import { useChangePassword } from '@/features/profile/hooks/use-credentials';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { FormError, FormTextField } from '@/shared/ui/form-field';

const CURRENT_ERRORS = ['auth.invalid_credentials'];
const NEW_ERRORS = ['identity.password_too_weak'];

export function PasswordSection() {
  const { t } = useTranslation();
  const change = useChangePassword();
  const errors = useAccountError();

  const form = useChangePasswordDtoForm({
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        await change.mutateAsync(value);
        toast.success(t('account.password.changed'));
        form.reset();
      } catch (error) {
        errors.apply(error);
      }
    },
  });

  const fieldError = (codes: string[]) =>
    errors.code && codes.includes(errors.code) ? (errors.message ?? undefined) : undefined;
  const onField = errors.code && [...CURRENT_ERRORS, ...NEW_ERRORS].includes(errors.code);

  return (
    <SectionCard
      title={t('account.password.title')}
      description={t('account.password.description')}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="currentPassword">
          {(field) => (
            <FormTextField
              field={field}
              id="change-password-current"
              type="password"
              autoComplete="current-password"
              label={t('account.fields.currentPassword')}
              serverError={fieldError(CURRENT_ERRORS)}
            />
          )}
        </form.Field>
        <form.Field name="newPassword">
          {(field) => (
            <FormTextField
              field={field}
              id="change-password-new"
              type="password"
              autoComplete="new-password"
              label={t('account.fields.newPassword')}
              serverError={fieldError(NEW_ERRORS)}
            />
          )}
        </form.Field>
        <FormError>{onField ? null : errors.message}</FormError>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {t('account.password.submit')}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionCard>
  );
}
