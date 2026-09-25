import type { MeView } from '@ekozhq/sdk';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard } from '@/features/profile/components/section-card';
import { useAccountError } from '@/features/profile/hooks/use-account-error';
import { useDeleteAvatar, useSetAvatar } from '@/features/profile/hooks/use-profile';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { FormError } from '@/shared/ui/form-field';
import { Label } from '@/shared/ui/label';
import { UserAvatar } from '@/shared/ui/user-avatar';

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

/** Preview of the current avatar with upload and remove buttons. */
export function AvatarEditor({ me }: { me: MeView }) {
  const { t } = useTranslation();
  const setAvatar = useSetAvatar();
  const deleteAvatar = useDeleteAvatar();
  const errors = useAccountError();
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = setAvatar.isPending || deleteAvatar.isPending;

  async function upload() {
    if (!file) return;
    errors.reset();
    try {
      await setAvatar.mutateAsync(file);
      toast.success(t('account.avatar.saved'));
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (error) {
      errors.apply(error);
    }
  }

  async function remove() {
    errors.reset();
    try {
      await deleteAvatar.mutateAsync();
      toast.success(t('account.avatar.removed'));
    } catch (error) {
      errors.apply(error);
    }
  }

  return (
    <SectionCard title={t('account.avatar.title')} description={t('account.avatar.description')}>
      <div className="flex items-center gap-4">
        <UserAvatar
          userId={me.id}
          identifier={me.identifier}
          avatarUrl={me.avatarUrl}
          displayName={me.displayName}
          className="size-20 text-2xl"
        />
        <div className="space-y-2">
          <Label htmlFor="account-avatar-file">{t('account.avatar.file')}</Label>
          <input
            ref={input}
            id="account-avatar-file"
            type="file"
            accept={ACCEPTED_TYPES}
            className="block text-sm"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <FormError>{errors.message}</FormError>
      <div className="flex gap-2">
        <Button type="button" disabled={!file || busy} onClick={() => void upload()}>
          {t('account.avatar.upload')}
        </Button>
        {me.avatarUrl ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void remove()}>
            {t('account.avatar.remove')}
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}
