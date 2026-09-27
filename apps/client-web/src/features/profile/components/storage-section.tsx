import type { MyStorageView } from '@ekozhq/sdk';

import { SectionCard } from '@/features/profile/components/section-card';
import { useStorage } from '@/features/profile/hooks/use-storage';
import { useTranslation } from '@/shared/i18n/use-translation';
import { formatBytes } from '@/shared/lib/format-bytes';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * `quotaBytes` is typed `string[]` by the generated SDK types, which does not match
 * the server's `z.string().nullable()` (`apps/server/src/core/storage/my-storage.dto.ts`):
 * a generator bug for a nullable-string schema. The wire value is really `string | null`
 * (`null` meaning unlimited); read it defensively until the contract is regenerated.
 */
function quotaOf(storage: MyStorageView): string | null {
  const raw = storage.quotaBytes as unknown as string | string[] | null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

/** The `/account` "Storage" section: a usage bar against the quota, or "unlimited". */
export function StorageSection() {
  const { t } = useTranslation();
  const storage = useStorage();

  return (
    <SectionCard title={t('account.storage.title')} description={t('account.storage.description')}>
      {storage.isPending ? (
        <Skeleton className="h-4 w-full" aria-label={t('account.storage.loading')} />
      ) : storage.isError ? (
        <p className="text-sm text-destructive">{t('account.storage.error')}</p>
      ) : (
        <StorageBar storage={storage.data} />
      )}
    </SectionCard>
  );
}

function StorageBar({ storage }: { storage: MyStorageView }) {
  const { t } = useTranslation();
  const used = Number(storage.usedBytes);
  const quotaBytes = quotaOf(storage);
  const quota = quotaBytes === null ? null : Number(quotaBytes);
  const percent = quota !== null && quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  return (
    <div className="space-y-2">
      {quota !== null ? (
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {quota === null
          ? t('account.storage.unlimited', { used: formatBytes(used) })
          : t('account.storage.usage', { used: formatBytes(used), quota: formatBytes(quota) })}
      </p>
    </div>
  );
}
