import type { MeView } from '@ekozhq/sdk';
import { useChangeUsernameDtoForm } from 'api/react-tanstack/ChangeUsernameDto.form';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';

import { SectionCard } from '@/features/profile/components/section-card';
import { useAccountError } from '@/features/profile/hooks/use-account-error';
import {
  useCancelUsernameRequest,
  useChangeUsername,
  useUsernameState,
} from '@/features/profile/hooks/use-credentials';
import { useTranslation } from '@/shared/i18n/use-translation';
import { Button } from '@/shared/ui/button';
import { FormError, FormTextField } from '@/shared/ui/form-field';
import { Skeleton } from '@/shared/ui/skeleton';

const FIELD_ERRORS = ['identity.identifier_invalid', 'identity.username_taken'];
const STATE_ERRORS = [
  'identity.username_immutable',
  'identity.username_change_cooldown',
  'identity.username_request_pending',
];

/** The server part of a `name/server` identifier, shown as static text next to the input. */
function serverOf(identifier: string | null): string {
  return identifier?.split('/')[1] ?? '';
}

export function UsernameSection({ me }: { me: MeView }) {
  const { t, i18n } = useTranslation();
  const state = useUsernameState();
  const change = useChangeUsername();
  const cancel = useCancelUsernameRequest();
  const errors = useAccountError();
  const [now] = useState(() => Date.now());

  const form = useChangeUsernameDtoForm({
    onSubmit: async ({ value }) => {
      errors.reset();
      try {
        const outcome = await change.mutateAsync({ name: value.name });
        toast.success(
          outcome.status === 'applied'
            ? t('account.username.applied')
            : t('account.username.submitted'),
        );
        form.reset();
      } catch (error) {
        const { code } = errors.apply(error);
        if (STATE_ERRORS.includes(code)) void state.refetch();
      }
    },
  });

  async function cancelRequest() {
    errors.reset();
    try {
      await cancel.mutateAsync();
    } catch (error) {
      errors.apply(error);
    }
  }

  let body: ReactNode;
  if (state.isPending) {
    body = <Skeleton className="h-20 w-full" data-testid="username-skeleton" />;
  } else if (state.isError) {
    body = <FormError>{t('account.errors.generic')}</FormError>;
  } else if (state.data.policy === 'immutable') {
    body = <p className="text-sm text-muted-foreground">{t('account.username.immutable')}</p>;
  } else if (state.data.pendingRequest) {
    body = (
      <div className="space-y-2">
        <p className="text-sm">
          {t('account.username.awaiting', { name: state.data.pendingRequest.requestedName })}
        </p>
        <FormError>{errors.message}</FormError>
        <Button
          type="button"
          variant="outline"
          disabled={cancel.isPending}
          onClick={() => void cancelRequest()}
        >
          {t('account.username.cancel')}
        </Button>
      </div>
    );
  } else {
    const nextChangeAt = state.data.nextChangeAt ? new Date(state.data.nextChangeAt) : null;
    const locked = nextChangeAt !== null && nextChangeAt.getTime() > now;

    body = (
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {state.data.policy === 'approval' ? (
          <p className="text-sm text-muted-foreground">{t('account.username.approvalNote')}</p>
        ) : null}
        {locked ? (
          <p className="text-sm text-muted-foreground">
            {t('account.username.cooldown', {
              date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
                nextChangeAt,
              ),
            })}
          </p>
        ) : null}
        <form.Field name="name">
          {(field) => (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <FormTextField
                  field={field}
                  label={t('account.fields.username')}
                  autoComplete="off"
                  disabled={locked}
                  serverError={
                    FIELD_ERRORS.includes(errors.code ?? '')
                      ? (errors.message ?? undefined)
                      : undefined
                  }
                />
              </div>
              <span className="pb-2 text-sm text-muted-foreground">/{serverOf(me.identifier)}</span>
            </div>
          )}
        </form.Field>
        <FormError>{FIELD_ERRORS.includes(errors.code ?? '') ? null : errors.message}</FormError>
        <form.Subscribe selector={(formState) => formState.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={locked || isSubmitting}>
              {t('account.username.submit')}
            </Button>
          )}
        </form.Subscribe>
      </form>
    );
  }

  return (
    <SectionCard
      title={t('account.username.title')}
      description={me.identifier ? `@${me.identifier}` : undefined}
    >
      {body}
    </SectionCard>
  );
}
