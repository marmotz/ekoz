import { useDeleteMeDtoForm } from 'api/react-tanstack/DeleteMeDto.form';
import { toast } from 'sonner';

import { useAccountError } from '@/features/profile/hooks/use-account-error';
import { useDeleteAccount } from '@/features/profile/hooks/use-delete-account';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { FormError, FormTextField } from '@/shared/ui/form-field';

const WRONG_PASSWORD = 'auth.invalid_credentials';

/**
 * Asks for the password before deleting the account. On success the SDK has cleared
 * the session and the query cache is emptied, so `RequireAuth` sends the user to
 * `/login` by itself.
 */
export function DeleteAccountDialog() {
  const { t } = useTranslation();
  const remove = useDeleteAccount();
  const errors = useAccountError();

  const form = useDeleteMeDtoForm({
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        await remove.mutateAsync(value);
        toast.success(t('account.danger.deleted'));
      } catch (error) {
        errors.apply(error);
      }
    },
  });

  return (
    <Dialog
      onOpenChange={() => {
        errors.reset();
        form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="destructive">
          {t('account.danger.open')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('account.danger.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('account.danger.consequences')}</DialogDescription>
          </DialogHeader>
          <form.Field name="password">
            {(field) => (
              <FormTextField
                field={field}
                id="delete-account-password"
                type="password"
                autoComplete="current-password"
                label={t('account.fields.currentPassword')}
                serverError={
                  errors.code === WRONG_PASSWORD ? (errors.message ?? undefined) : undefined
                }
              />
            )}
          </form.Field>
          <FormError>{errors.code === WRONG_PASSWORD ? null : errors.message}</FormError>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('account.danger.cancel')}
              </Button>
            </DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" variant="destructive" disabled={isSubmitting}>
                  {t('account.danger.confirm')}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
