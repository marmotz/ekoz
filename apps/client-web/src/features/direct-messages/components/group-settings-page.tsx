import type { ConversationListItem } from '@ekozhq/sdk';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import { conversationErrorKey } from '@/features/direct-messages/api/errors';
import { ConfirmDialog } from '@/features/direct-messages/components/confirm-dialog';
import { UserPicker } from '@/features/direct-messages/components/user-picker';
import type { PickerUser } from '@/features/direct-messages/hooks/use-contact-search';
import { useConversationAccess } from '@/features/direct-messages/hooks/use-conversation-access';
import {
  useAddGroupMembers,
  useLeaveConversation,
  useRemoveGroupMember,
  useRenameGroup,
  useSetGroupAdmin,
} from '@/features/direct-messages/hooks/use-conversation-mutations';
import { participantName } from '@/features/direct-messages/lib/display-name';
import { useTranslation } from '@/shared/i18n/use-translation';
import { useMe } from '@/shared/sdk/use-me';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { UserAvatar } from '@/shared/ui/user-avatar';

/**
 * `/dms/$roomId/settings` (technical design 4.7), under the conversation gate and header:
 * the participants with their admin badge, and, for a group admin (`room.manage_members`),
 * rename, add members (with or without the past messages), remove a member and promote or
 * demote an admin. Every member can leave. When the caller is the only admin, leaving or
 * giving up the role warns that the group will be deleted for everyone.
 */
export function GroupSettingsPage({ roomId }: { roomId: string }) {
  const access = useConversationAccess(roomId);

  if (access.status !== 'ready') return null;
  if (access.room.type === 'dm') {
    return <Navigate to="/dms/$roomId" params={{ roomId }} replace />;
  }
  return (
    <GroupSettings
      roomId={roomId}
      name={access.room.name}
      participants={access.conversation?.participants ?? []}
      callerIsAdmin={
        access.conversation?.isAdmin ?? access.capabilities.includes('room.manage_members')
      }
      canManage={access.capabilities.includes('room.manage_members')}
    />
  );
}

type Participants = ConversationListItem['participants'];

interface GroupSettingsProps {
  roomId: string;
  name: string | null;
  participants: Participants;
  callerIsAdmin: boolean;
  canManage: boolean;
}

type Confirming = 'leave' | 'giveUpAdmin' | null;

function GroupSettings({
  roomId,
  name,
  participants,
  callerIsAdmin,
  canManage,
}: GroupSettingsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe().data;
  const rename = useRenameGroup(roomId);
  const addMembers = useAddGroupMembers(roomId);
  const removeMember = useRemoveGroupMember(roomId);
  const setAdmin = useSetGroupAdmin(roomId);
  const leave = useLeaveConversation();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [draftName, setDraftName] = useState(name ?? '');
  const [added, setAdded] = useState<PickerUser[]>([]);
  const [showPast, setShowPast] = useState(true);

  const onlyAdmin = callerIsAdmin && !participants.some((participant) => participant.isAdmin);
  const unknown = t('directMessages.picker.unknownUser');
  const goHome = () => void navigate({ to: '/' });

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    rename.mutate(draftName.trim() || null);
  };
  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    if (added.length === 0) return;
    addMembers.mutate(
      { userIds: added.map((user) => user.id), history: showPast ? 'full' : 'none' },
      { onSuccess: () => setAdded([]) },
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 overflow-y-auto p-8">
      <h3 className="text-xl font-bold">{t('directMessages.settings.title')}</h3>

      {canManage && (
        <form onSubmit={submitRename} className="space-y-2">
          <Label htmlFor="group-rename">{t('directMessages.settings.rename.label')}</Label>
          <div className="flex gap-2">
            <Input
              id="group-rename"
              value={draftName}
              maxLength={200}
              placeholder={t('directMessages.settings.rename.placeholder')}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <Button type="submit" disabled={rename.isPending}>
              {t('directMessages.settings.rename.save')}
            </Button>
          </div>
          {rename.error ? (
            <p role="alert" className="text-sm text-destructive">
              {t(conversationErrorKey(rename.error))}
            </p>
          ) : null}
        </form>
      )}

      <section aria-labelledby="group-participants" className="space-y-3">
        <h4 id="group-participants" className="font-semibold">
          {t('directMessages.settings.participants')}
        </h4>
        <ul className="flex flex-col gap-2">
          <li className="flex flex-wrap items-center gap-2">
            <UserAvatar
              userId={me?.id}
              identifier={me?.identifier}
              avatarUrl={me?.avatarUrl}
              displayName={me?.displayName}
              className="size-7"
            />
            <span className="flex-1 truncate">
              {me?.displayName ?? unknown} {t('directMessages.settings.you')}
            </span>
            {callerIsAdmin && <AdminBadge />}
            {callerIsAdmin && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirming('giveUpAdmin')}
              >
                {t('directMessages.settings.giveUpAdmin')}
              </Button>
            )}
          </li>
          {participants.map((participant) => {
            const label = participantName(participant, unknown);
            return (
              <li key={participant.user.id} className="flex flex-wrap items-center gap-2">
                <UserAvatar
                  userId={participant.user.id}
                  identifier={participant.user.identifier}
                  avatarUrl={participant.user.avatarUrl}
                  displayName={participant.user.displayName}
                  className="size-7"
                />
                <span className="flex-1 truncate">{label}</span>
                {participant.isAdmin && <AdminBadge />}
                {canManage && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={setAdmin.isPending}
                      aria-label={t(
                        participant.isAdmin
                          ? 'directMessages.settings.demote'
                          : 'directMessages.settings.promote',
                        { name: label },
                      )}
                      onClick={() =>
                        setAdmin.mutate({
                          userId: participant.user.id,
                          admin: !participant.isAdmin,
                        })
                      }
                    >
                      {t(
                        participant.isAdmin
                          ? 'directMessages.settings.demoteShort'
                          : 'directMessages.settings.promoteShort',
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={removeMember.isPending}
                      aria-label={t('directMessages.settings.remove', { name: label })}
                      onClick={() => removeMember.mutate(participant.user.id)}
                    >
                      {t('directMessages.settings.removeShort')}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {(setAdmin.error ?? removeMember.error) ? (
          <p role="alert" className="text-sm text-destructive">
            {t(conversationErrorKey(setAdmin.error ?? removeMember.error))}
          </p>
        ) : null}
      </section>

      {canManage && (
        <form onSubmit={submitAdd} className="space-y-3">
          <h4 className="font-semibold">{t('directMessages.settings.add.title')}</h4>
          <UserPicker
            selected={added}
            onChange={setAdded}
            excludeIds={[
              ...(me ? [me.id] : []),
              ...participants.map((participant) => participant.user.id),
            ]}
            label={t('directMessages.settings.add.label')}
          />
          <div className="flex items-center gap-2">
            <input
              id="group-show-past"
              type="checkbox"
              checked={showPast}
              onChange={(event) => setShowPast(event.target.checked)}
            />
            <Label htmlFor="group-show-past">{t('directMessages.settings.add.showPast')}</Label>
          </div>
          {addMembers.error ? (
            <p role="alert" className="text-sm text-destructive">
              {t(conversationErrorKey(addMembers.error))}
            </p>
          ) : null}
          <Button type="submit" disabled={added.length === 0 || addMembers.isPending}>
            {t('directMessages.settings.add.submit')}
          </Button>
        </form>
      )}

      <section className="space-y-2">
        <Button type="button" variant="destructive" onClick={() => setConfirming('leave')}>
          {t('directMessages.settings.leave')}
        </Button>
      </section>

      <ConfirmDialog
        open={confirming === 'leave'}
        onOpenChange={(open) => setConfirming(open ? 'leave' : null)}
        title={t('directMessages.settings.leaveConfirm.title')}
        message={t('directMessages.settings.leaveConfirm.message')}
        warning={onlyAdmin ? t('directMessages.settings.lastAdminWarning') : undefined}
        confirmLabel="directMessages.settings.leaveConfirm.confirm"
        pending={leave.isPending}
        error={leave.error}
        onConfirm={() => leave.mutate(roomId, { onSuccess: goHome })}
      />
      <ConfirmDialog
        open={confirming === 'giveUpAdmin'}
        onOpenChange={(open) => setConfirming(open ? 'giveUpAdmin' : null)}
        title={t('directMessages.settings.giveUpConfirm.title')}
        message={t('directMessages.settings.giveUpConfirm.message')}
        warning={onlyAdmin ? t('directMessages.settings.lastAdminWarning') : undefined}
        confirmLabel="directMessages.settings.giveUpConfirm.confirm"
        pending={setAdmin.isPending}
        error={setAdmin.error}
        onConfirm={() =>
          setAdmin.mutate(
            { userId: me?.id ?? '', admin: false },
            {
              onSuccess: () => {
                setConfirming(null);
                if (onlyAdmin) goHome();
              },
            },
          )
        }
      />
    </div>
  );
}

function AdminBadge() {
  const { t } = useTranslation();

  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {t('directMessages.settings.admin')}
    </span>
  );
}
