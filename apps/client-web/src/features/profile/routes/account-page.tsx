import { AvatarEditor } from '@/features/profile/components/avatar-editor';
import { DangerZone } from '@/features/profile/components/danger-zone';
import { EmailSection } from '@/features/profile/components/email-section';
import { PasswordSection } from '@/features/profile/components/password-section';
import { ProfileSection } from '@/features/profile/components/profile-section';
import { SessionsSection } from '@/features/profile/components/sessions-section';
import { StorageSection } from '@/features/profile/components/storage-section';
import { UsernameSection } from '@/features/profile/components/username-section';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useMe } from '@/shared/sdk/use-me';
import { FormError } from '@/shared/ui/form-field';
import { Skeleton } from '@/shared/ui/skeleton';

/** The `/account` page: every section for the signed-in user's own account. */
export function AccountPage() {
  const { t } = useTranslation();
  const me = useMe();

  if (me.isPending) return <Skeleton className="h-64 w-full" data-testid="account-skeleton" />;
  if (me.isError) return <FormError>{t('account.errors.generic')}</FormError>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <ProfileSection me={me.data} />
      <AvatarEditor me={me.data} />
      <UsernameSection me={me.data} />
      <EmailSection me={me.data} />
      <PasswordSection />
      <SessionsSection />
      <StorageSection />
      <DangerZone />
    </div>
  );
}
