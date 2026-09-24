import { ValidationError } from '@ekozhq/sdk';
import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useZodForm } from 'api/react-tanstack/form.runtime';
import type { ParseKeys } from 'i18next';
import { type ReactNode, useMemo, useState } from 'react';
import { z } from 'zod';

import { hasRoomErrorCode, roomErrorKey } from '@/features/rooms/api/errors';
import { roomQueries } from '@/features/rooms/api/queries';
import { useCreateChannel, useCreateSpace } from '@/features/rooms/hooks/use-room-mutations';
import { useRooms } from '@/features/rooms/hooks/use-room-queries';
import { useTranslation } from '@/shared/i18n/use-translation';
import { type Message, validationMessage } from '@/shared/i18n/validation-message';
import { cn } from '@/shared/lib/utils';
import { useMe } from '@/shared/sdk/use-me';
import { useSdk } from '@/shared/sdk/use-sdk';
import { Button } from '@/shared/ui/button';
import { FormError, FormTextField } from '@/shared/ui/form-field';
import { Label } from '@/shared/ui/label';
import { Skeleton } from '@/shared/ui/skeleton';

const VISIBILITIES = ['private', 'public', 'invite'] as const;
type Visibility = (typeof VISIBILITIES)[number];

interface CreateRoomValues {
  type: 'space' | 'channel';
  /** `''`: no parent, a root space (owner only). */
  parentId: string;
  name: string;
  topic: string;
  visibility: Visibility;
}

const FIELDS = ['parentId', 'name', 'topic', 'visibility'] as const;
/** Server codes about the chosen parent, shown under the parent field. */
const PARENT_CODES = [
  'room.parent_not_found',
  'room.max_depth_exceeded',
  'room.invalid_parent_type',
];

interface ServerErrors {
  form: string | null;
  fields: Partial<Record<(typeof FIELDS)[number], string>>;
}

const NO_ERRORS: ServerErrors = { form: null, fields: {} };

const selectClass = cn(
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs',
  'outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive',
);

/**
 * `/rooms/new`: create a space or a channel (technical design 4.7). The parents offered
 * are the listed spaces where the caller holds `space.create_child`; an owner may also
 * create a root space. Without any, an explanation replaces the form.
 */
export function CreateRoomForm() {
  const { t } = useTranslation();
  const sdk = useSdk();
  const rooms = useRooms();
  const me = useMe();
  const spaces = (rooms.data?.items ?? []).filter((item) => item.type === 'space');
  const permissions = useQueries({
    queries: spaces.map((space) => roomQueries.permissions(sdk, space.id)),
  });

  const pending = rooms.isPending || me.isPending || permissions.some((query) => query.isPending);
  // Only the first load shows the skeleton. A refreshed list can bring a new space (one created
  // a moment ago) whose permissions are then pending: unmounting the form would reset it.
  const [loaded, setLoaded] = useState(false);
  if (!pending && !loaded) setLoaded(true);
  const loading = !loaded && pending;
  const parents = spaces.filter((_space, index) =>
    permissions[index]?.data?.capabilities.includes('space.create_child'),
  );
  const isOwner = me.data?.isOwner ?? false;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h2 className="text-2xl font-bold">{t('rooms.create.title')}</h2>
      {loading ? (
        <div role="status" aria-label={t('rooms.create.loading')} className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : parents.length === 0 && !isOwner ? (
        <p className="text-muted-foreground">{t('rooms.create.notAllowed')}</p>
      ) : (
        <CreateRoomFields
          parents={parents.map(({ id, name }) => ({ id, name }))}
          isOwner={isOwner}
        />
      )}
    </div>
  );
}

function CreateRoomFields({
  parents,
  isOwner,
}: {
  parents: { id: string; name: string | null }[];
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createSpace = useCreateSpace();
  const createChannel = useCreateChannel();
  const [serverErrors, setServerErrors] = useState<ServerErrors>(NO_ERRORS);
  const translate = (message: Message) =>
    'text' in message ? message.text : t(message.key, message.values);

  const schema = useMemo(
    () =>
      z
        .object({
          type: z.enum(['space', 'channel']),
          parentId: z.string(),
          name: z.string().trim().min(1).max(200),
          topic: z.string().max(2000),
          visibility: z.enum(VISIBILITIES),
        })
        .superRefine((value, context) => {
          // Only an owner may create a root space; a channel always lives in a space.
          if (value.parentId === '' && (value.type === 'channel' || !isOwner)) {
            context.addIssue({
              code: 'custom',
              path: ['parentId'],
              message: t('rooms.create.parentRequired'),
            });
          }
        }),
    [t, isOwner],
  );

  const form = useZodForm<CreateRoomValues>({
    defaultValues: {
      type: 'space',
      parentId: isOwner ? '' : (parents[0]?.id ?? ''),
      name: '',
      topic: '',
      visibility: 'private',
    },
    schema,
    onSubmit: async ({ value }) => {
      setServerErrors(NO_ERRORS);
      const common = {
        name: value.name.trim(),
        topic: value.topic.trim() === '' ? undefined : value.topic,
        visibility: value.visibility,
      };

      try {
        const room =
          value.type === 'space'
            ? await createSpace.mutateAsync({ ...common, parentId: value.parentId || undefined })
            : await createChannel.mutateAsync({ ...common, parentId: value.parentId });
        await navigate({ to: '/rooms/$roomId', params: { roomId: room.id } });
      } catch (error) {
        setServerErrors(mapServerError(error, (key) => t(key)));
      }
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="type">
        {(field) => (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('rooms.create.type')}</legend>
            <div className="flex gap-4">
              {(['space', 'channel'] as const).map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={field.name}
                    value={type}
                    checked={field.state.value === type}
                    // A channel needs a parent: none can be offered without an eligible space.
                    disabled={type === 'channel' && parents.length === 0}
                    onChange={() => {
                      field.handleChange(type);
                      if (type === 'channel' && form.getFieldValue('parentId') === '') {
                        form.setFieldValue('parentId', parents[0]?.id ?? '');
                      }
                    }}
                  />
                  {t(type === 'space' ? 'rooms.create.typeSpace' : 'rooms.create.typeChannel')}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.type}>
        {(type) => (
          <form.Field name="parentId">
            {(field) => (
              <SelectField
                id="field-parentId"
                label={t('rooms.create.parent')}
                error={
                  serverErrors.fields.parentId ?? fieldError(field.state.meta.errors, translate)
                }
              >
                <select
                  id="field-parentId"
                  name={field.name}
                  className={selectClass}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                >
                  {type === 'space' && isOwner ? (
                    <option value="">{t('rooms.create.noParent')}</option>
                  ) : (
                    <option value="" disabled>
                      {t('rooms.create.chooseParent')}
                    </option>
                  )}
                  {parents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name ?? t('rooms.unnamed')}
                    </option>
                  ))}
                </select>
              </SelectField>
            )}
          </form.Field>
        )}
      </form.Subscribe>
      <form.Field name="name">
        {(field) => (
          <FormTextField
            field={field}
            label={t('rooms.create.name')}
            serverError={serverErrors.fields.name}
          />
        )}
      </form.Field>
      <form.Field name="topic">
        {(field) => (
          <FormTextField
            field={field}
            type="textarea"
            rows={3}
            label={t('rooms.create.topic')}
            serverError={serverErrors.fields.topic}
          />
        )}
      </form.Field>
      <form.Field name="visibility">
        {(field) => (
          <SelectField
            id="field-visibility"
            label={t('rooms.create.visibility')}
            error={serverErrors.fields.visibility}
          >
            <select
              id="field-visibility"
              name={field.name}
              className={selectClass}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value as Visibility)}
            >
              <option value="private">{t('rooms.create.visibilityPrivate')}</option>
              <option value="public">{t('rooms.create.visibilityPublic')}</option>
              <option value="invite">{t('rooms.create.visibilityInvite')}</option>
            </select>
          </SelectField>
        )}
      </form.Field>
      <FormError>{serverErrors.form}</FormError>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {t('rooms.create.submit')}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function SelectField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function fieldError(
  errors: readonly unknown[],
  translate: (message: Message) => string,
): string | undefined {
  return errors.length === 0 ? undefined : translate(validationMessage(errors[0]));
}

/** `422` issues go to their field; parent codes under the parent; anything else to the form. */
function mapServerError(error: unknown, t: (key: ParseKeys) => string): ServerErrors {
  if (error instanceof ValidationError && error.issues.length > 0) {
    const fields: ServerErrors['fields'] = {};
    let form: string | null = null;
    for (const issue of error.issues) {
      const field = FIELDS.find((name) => name === issue.path);
      if (field) fields[field] ??= issue.message;
      else form ??= issue.message;
    }
    return { form, fields };
  }
  if (PARENT_CODES.some((code) => hasRoomErrorCode(error, code))) {
    return { form: null, fields: { parentId: t(roomErrorKey(error)) } };
  }
  return { form: t(roomErrorKey(error)), fields: {} };
}
