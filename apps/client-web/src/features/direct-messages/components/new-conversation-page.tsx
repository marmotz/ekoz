import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import { conversationErrorKey } from '@/features/direct-messages/api/errors';
import { UserPicker } from '@/features/direct-messages/components/user-picker';
import type { PickerUser } from '@/features/direct-messages/hooks/use-contact-search';
import {
  useCreateDm,
  useCreateGroup,
} from '@/features/direct-messages/hooks/use-conversation-mutations';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useMe } from '@/shared/sdk/use-me';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

/**
 * `/dms/new`: pick one person to start a one-to-one conversation, or two or more to create
 * a group (with an optional name). Both then open the conversation (technical design 4.6).
 */
export function NewConversationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useMe().data?.id;
  const createDm = useCreateDm();
  const createGroup = useCreateGroup();
  const [selected, setSelected] = useState<PickerUser[]>([]);
  const [name, setName] = useState('');

  const isGroup = selected.length >= 2;
  const pending = createDm.isPending || createGroup.isPending;
  const error = createDm.error ?? createGroup.error;

  const open = (roomId: string) => void navigate({ to: '/dms/$roomId', params: { roomId } });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected.length === 0) return;
    if (isGroup) {
      const groupName = name.trim();
      createGroup.mutate(
        { userIds: selected.map((user) => user.id), ...(groupName ? { name: groupName } : {}) },
        { onSuccess: (room) => open(room.id) },
      );
    } else {
      createDm.mutate(selected[0]?.id ?? '', { onSuccess: (room) => open(room.id) });
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6 p-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">{t('directMessages.new.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('directMessages.new.description')}</p>
      </div>
      <UserPicker
        selected={selected}
        onChange={setSelected}
        excludeIds={myId ? [myId] : []}
        label={t('directMessages.picker.label')}
      />
      {isGroup && (
        <div className="space-y-2">
          <Label htmlFor="group-name">{t('directMessages.new.groupName')}</Label>
          <Input
            id="group-name"
            value={name}
            maxLength={200}
            placeholder={t('directMessages.new.groupNamePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(conversationErrorKey(error))}
        </p>
      ) : null}
      <Button type="submit" disabled={selected.length === 0 || pending}>
        {isGroup ? t('directMessages.new.createGroup') : t('directMessages.new.start')}
      </Button>
    </form>
  );
}
