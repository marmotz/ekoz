import type { SessionView } from '@ekozhq/sdk';
import { useRenameSessionDtoForm } from 'api/react-tanstack/RenameSessionDto.form';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard } from '@/features/profile/components/section-card';
import { useAccountError } from '@/features/profile/hooks/use-account-error';
import {
  useRenameSession,
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from '@/features/profile/hooks/use-sessions';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { FormError, FormTextField } from '@/shared/ui/form-field';
import { Skeleton } from '@/shared/ui/skeleton';

interface RowProps {
  session: SessionView;
  onError: (error: unknown) => void;
  onReset: () => void;
}

function RenameForm({ session, onDone, onError, onReset }: RowProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const rename = useRenameSession();

  const form = useRenameSessionDtoForm({
    defaultValues: { deviceName: session.deviceName },
    onSubmit: async ({ value }) => {
      onReset();
      try {
        await rename.mutateAsync({ id: session.id, deviceName: value.deviceName });
        onDone();
      } catch (error) {
        onError(error);
      }
    },
  });

  return (
    <form
      noValidate
      className="flex flex-1 items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex-1">
        <form.Field name="deviceName">
          {(field) => (
            <FormTextField
              field={field}
              id={`rename-${session.id}`}
              label={t('account.sessions.deviceName')}
              autoFocus
            />
          )}
        </form.Field>
      </div>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {t('account.sessions.save')}
          </Button>
        )}
      </form.Subscribe>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        {t('account.sessions.cancel')}
      </Button>
    </form>
  );
}

function SessionRow({ session, onError, onReset }: RowProps) {
  const { t, i18n } = useTranslation();
  const revoke = useRevokeSession();
  const [renaming, setRenaming] = useState(false);

  async function revokeSession() {
    onReset();
    try {
      await revoke.mutateAsync(session.id);
    } catch (error) {
      onError(error);
    }
  }

  const lastSeen = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(session.lastSeenAt));

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
      {renaming ? (
        <RenameForm
          session={session}
          onDone={() => setRenaming(false)}
          onError={onError}
          onReset={onReset}
        />
      ) : (
        <>
          <div className="space-y-0.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              {session.deviceName}
              {session.current ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
                  {t('account.sessions.current')}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('account.sessions.lastSeen', { date: lastSeen })}
              {session.ip ? ` - ${session.ip}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={t('account.sessions.renameNamed', { name: session.deviceName })}
              onClick={() => setRenaming(true)}
            >
              {t('account.sessions.rename')}
            </Button>
            {session.current ? null : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={t('account.sessions.revokeNamed', { name: session.deviceName })}
                disabled={revoke.isPending}
                onClick={() => void revokeSession()}
              >
                {t('account.sessions.revoke')}
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function SessionsSection() {
  const { t } = useTranslation();
  const sessions = useSessions();
  const revokeOthers = useRevokeOtherSessions();
  const errors = useAccountError();

  async function signOutOthers() {
    errors.reset();
    try {
      const { revoked } = await revokeOthers.mutateAsync();
      toast.success(t('account.sessions.revokedOthers', { count: revoked }));
    } catch (error) {
      errors.apply(error);
    }
  }

  let body: ReactNode;
  if (sessions.isPending) {
    body = <Skeleton className="h-16 w-full" data-testid="sessions-skeleton" />;
  } else if (sessions.isError) {
    body = <FormError>{t('account.errors.generic')}</FormError>;
  } else {
    body = (
      <>
        <ul className="space-y-2">
          {sessions.data.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onError={errors.apply}
              onReset={errors.reset}
            />
          ))}
        </ul>
        <FormError>{errors.message}</FormError>
        {sessions.data.some((session) => !session.current) ? (
          <Button
            type="button"
            variant="outline"
            disabled={revokeOthers.isPending}
            onClick={() => void signOutOthers()}
          >
            {t('account.sessions.revokeOthers')}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <SectionCard
      title={t('account.sessions.title')}
      description={t('account.sessions.description')}
    >
      {body}
    </SectionCard>
  );
}
