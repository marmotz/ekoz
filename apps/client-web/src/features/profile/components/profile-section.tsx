import type { MeView, UpdateProfileBody } from '@ekozhq/sdk';
import { useUpdateProfileDtoForm } from 'api/react-tanstack/UpdateProfileDto.form';
import { toast } from 'sonner';

import { SectionCard } from '@/features/profile/components/section-card';
import { useAccountError } from '@/features/profile/hooks/use-account-error';
import { useUpdateProfile } from '@/features/profile/hooks/use-profile';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { FormError, FormTextField } from '@/shared/ui/form-field';

const PROFILE_INVALID = 'identity.profile_invalid';

/** Display name and biography; only the fields that changed are sent. */
export function ProfileSection({ me }: { me: MeView }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const errors = useAccountError();

  const form = useUpdateProfileDtoForm({
    defaultValues: { displayName: me.displayName, bio: me.bio ?? '' },
    onSubmit: async ({ value }) => {
      errors.reset();

      const body: UpdateProfileBody = {};
      const displayName = value.displayName ?? '';
      if (displayName !== me.displayName) body.displayName = displayName;
      const bio = (value.bio ?? '').trim() === '' ? null : (value.bio ?? null);
      if (bio !== me.bio) body.bio = bio;
      if (Object.keys(body).length === 0) return;

      try {
        await update.mutateAsync(body);
        toast.success(t('account.profile.saved'));
      } catch (error) {
        errors.apply(error);
      }
    },
  });

  return (
    <SectionCard title={t('account.profile.title')} description={t('account.profile.description')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="displayName">
          {(field) => <FormTextField field={field} label={t('account.fields.displayName')} />}
        </form.Field>
        <form.Field name="bio">
          {(field) => (
            <FormTextField
              field={field}
              type="textarea"
              rows={4}
              label={t('account.fields.bio')}
              serverError={
                errors.code === PROFILE_INVALID ? (errors.message ?? undefined) : undefined
              }
            />
          )}
        </form.Field>
        <FormError>{errors.code === PROFILE_INVALID ? null : errors.message}</FormError>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {t('account.profile.submit')}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </SectionCard>
  );
}
