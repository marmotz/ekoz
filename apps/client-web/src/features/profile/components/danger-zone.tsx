import { DeleteAccountDialog } from '@/features/profile/components/delete-account-dialog';
import { SectionCard } from '@/features/profile/components/section-card';
import { useTranslation } from '@/shared/i18n/use-translation';

export function DangerZone() {
  const { t } = useTranslation();

  return (
    <SectionCard
      title={t('account.danger.title')}
      description={t('account.danger.description')}
      className="border-destructive/50"
    >
      <DeleteAccountDialog />
    </SectionCard>
  );
}
