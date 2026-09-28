import type { ConfigParameterView } from '@ekozhq/sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from '@/shared/i18n/use-translation';
import { AppShell } from '@/shared/layout/app-shell';
import { registerNav } from '@/shared/layout/nav-registry';
import { type ByteUnit, bytesToUnitAmount, unitAmountToBytes } from '@/shared/lib/bytes';
import { RequireOwner } from '@/shared/sdk/require-owner';
import { useSdk } from '@/shared/sdk/session';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';

registerNav({
  id: 'settings-sharing',
  to: '/settings/sharing',
  labelKey: 'nav.settingsSharing',
  icon: Settings,
});

export const Route = createFileRoute('/settings/sharing')({
  component: SharingSettingsRoute,
});

type FieldKind =
  | 'bytes'
  | 'bytesNullable'
  | 'int'
  | 'duration'
  | 'bool'
  | 'enum'
  | 'stringList'
  | 'json';

interface FieldDef {
  key: string;
  kind: FieldKind;
  labelKey: string;
  options?: readonly string[];
}

const FIELDS: readonly FieldDef[] = [
  { key: 'uploads.max_file_bytes', kind: 'bytes', labelKey: 'maxFileBytes' },
  { key: 'uploads.default_quota_bytes', kind: 'bytes', labelKey: 'defaultQuotaBytes' },
  { key: 'uploads.pending_ttl', kind: 'duration', labelKey: 'pendingTtl' },
  {
    key: 'uploads.filter_mode',
    kind: 'enum',
    labelKey: 'filterMode',
    options: ['blocklist', 'allowlist'],
  },
  { key: 'uploads.filter_types', kind: 'stringList', labelKey: 'filterTypes' },
  { key: 'attachments.max_per_message', kind: 'int', labelKey: 'maxPerMessage' },
  { key: 'storage.capacity_bytes', kind: 'bytesNullable', labelKey: 'capacityBytes' },
  { key: 'link_previews.enabled', kind: 'bool', labelKey: 'linkPreviewsEnabled' },
  { key: 'link_previews.cache_ttl', kind: 'duration', labelKey: 'linkPreviewsCacheTtl' },
  { key: 'link_previews.throttle', kind: 'json', labelKey: 'linkPreviewsThrottle' },
  { key: 'files.url_ttl', kind: 'duration', labelKey: 'filesUrlTtl' },
];

function sourceBadgeVariant(source: ConfigParameterView['source']) {
  switch (source) {
    case 'env':
      return 'destructive' as const;
    case 'settings':
      return 'default' as const;
    case 'file':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
}

function SharingSettingsRoute() {
  const { t } = useTranslation(['settings', 'common']);
  const sdk = useSdk();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => sdk?.admin.settings.list(),
    enabled: !!sdk,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });

  function requireSdk() {
    if (!sdk) throw new Error('SDK not ready');
    return sdk;
  }

  const setMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      requireSdk().admin.settings.set(key, value),
    onSuccess: () => {
      toast.success(t('settings:toasts.saved'));
      void invalidate();
    },
    onError: () => toast.error(t('common:errors.generic')),
  });

  const resetMutation = useMutation({
    mutationFn: (key: string) => requireSdk().admin.settings.reset(key),
    onSuccess: () => {
      toast.success(t('settings:toasts.reset'));
      void invalidate();
    },
    onError: () => toast.error(t('common:errors.generic')),
  });

  const byKey = new Map((query.data ?? []).map((param) => [param.key, param]));

  return (
    <RequireOwner>
      <AppShell title={t('settings:sharing.title')}>
        {query.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="flex max-w-2xl flex-col divide-y">
            {FIELDS.map((def) => {
              const param = byKey.get(def.key);
              if (!param) return null;
              return (
                <SettingRow
                  key={`${def.key}:${param.source}:${JSON.stringify(param.value)}`}
                  def={def}
                  param={param}
                  saving={setMutation.isPending}
                  resetting={resetMutation.isPending}
                  onSave={(value) => setMutation.mutate({ key: def.key, value })}
                  onReset={() => resetMutation.mutate(def.key)}
                />
              );
            })}
          </div>
        )}
      </AppShell>
    </RequireOwner>
  );
}

function SettingRow({
  def,
  param,
  saving,
  resetting,
  onSave,
  onReset,
}: {
  def: FieldDef;
  param: ConfigParameterView;
  saving: boolean;
  resetting: boolean;
  onSave: (value: unknown) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const disabled = param.locked;
  const canReset = !param.locked && param.source !== 'default';

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{t(`settings:fields.${def.labelKey}`)}</span>
          <Badge variant={sourceBadgeVariant(param.source)}>
            {t(`settings:source.${param.source}`)}
          </Badge>
          {param.locked && <Badge variant="destructive">{t('settings:locked')}</Badge>}
        </div>
        <FieldControl def={def} param={param} disabled={disabled || saving} onSave={onSave} />
      </div>
      {canReset && (
        <Button variant="outline" size="sm" disabled={resetting} onClick={onReset}>
          {t('settings:actions.resetToDefault')}
        </Button>
      )}
    </div>
  );
}

function FieldControl({
  def,
  param,
  disabled,
  onSave,
}: {
  def: FieldDef;
  param: ConfigParameterView;
  disabled: boolean;
  onSave: (value: unknown) => void;
}) {
  // `ConfigParameterView.value` is typed `string` by the OpenAPI generator (it has no
  // declared schema type server-side), but actually holds the parameter's real JSON value.
  const raw: unknown = param.value;

  switch (def.kind) {
    case 'bytes':
    case 'bytesNullable':
      return (
        <BytesInput
          value={raw as number | null}
          nullable={def.kind === 'bytesNullable'}
          disabled={disabled}
          onSave={onSave}
        />
      );
    case 'int':
      return <IntInput value={raw as number} disabled={disabled} onSave={onSave} />;
    case 'duration':
      return <TextInput value={raw as string} disabled={disabled} onSave={onSave} />;
    case 'bool':
      return <BoolInput value={raw as boolean} disabled={disabled} onSave={onSave} />;
    case 'enum':
      return (
        <EnumInput
          value={raw as string}
          options={def.options ?? []}
          disabled={disabled}
          onSave={onSave}
        />
      );
    case 'stringList':
      return <StringListInput value={raw as string[]} disabled={disabled} onSave={onSave} />;
    case 'json':
      return <JsonInput value={raw} disabled={disabled} onSave={onSave} />;
    default:
      return null;
  }
}

function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

function SaveButton({
  dirty,
  disabled,
  onClick,
}: {
  dirty: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation('common');
  if (!dirty) return null;
  return (
    <Button size="sm" disabled={disabled} onClick={onClick}>
      {t('actions.save')}
    </Button>
  );
}

function BytesInput({
  value,
  nullable,
  disabled,
  onSave,
}: {
  value: number | null;
  nullable: boolean;
  disabled: boolean;
  onSave: (value: number | null) => void;
}) {
  const initial =
    value === null ? { amount: '', unit: 'MB' as ByteUnit } : bytesToUnitAmount(value);
  const [amount, setAmount] = useState(String(initial.amount));
  const [unit, setUnit] = useState<ByteUnit>(initial.unit);
  const dirty = amount !== String(initial.amount) || unit !== initial.unit;

  return (
    <FieldRow>
      <Input
        type="number"
        min={0}
        className="w-32"
        value={amount}
        disabled={disabled}
        placeholder={nullable ? 'unlimited' : undefined}
        onChange={(event) => setAmount(event.target.value)}
      />
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={unit}
        disabled={disabled}
        onChange={(event) => setUnit(event.target.value as ByteUnit)}
      >
        <option value="MB">MB</option>
        <option value="GB">GB</option>
      </select>
      <SaveButton
        dirty={dirty}
        disabled={disabled}
        onClick={() => onSave(amount === '' ? null : unitAmountToBytes(Number(amount), unit))}
      />
    </FieldRow>
  );
}

function IntInput({
  value,
  disabled,
  onSave,
}: {
  value: number;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const dirty = text !== String(value);

  return (
    <FieldRow>
      <Input
        type="number"
        className="w-32"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <SaveButton dirty={dirty} disabled={disabled} onClick={() => onSave(Number(text))} />
    </FieldRow>
  );
}

function TextInput({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const dirty = text !== value;

  return (
    <FieldRow>
      <Input
        className="w-40"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <SaveButton dirty={dirty} disabled={disabled} onClick={() => onSave(text)} />
    </FieldRow>
  );
}

function BoolInput({
  value,
  disabled,
  onSave,
}: {
  value: boolean;
  disabled: boolean;
  onSave: (value: boolean) => void;
}) {
  const [checked, setChecked] = useState(value);
  const dirty = checked !== value;

  return (
    <FieldRow>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <SaveButton dirty={dirty} disabled={disabled} onClick={() => onSave(checked)} />
    </FieldRow>
  );
}

function EnumInput({
  value,
  options,
  disabled,
  onSave,
}: {
  value: string;
  options: readonly string[];
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const [selected, setSelected] = useState(value);
  const dirty = selected !== value;

  return (
    <FieldRow>
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={selected}
        disabled={disabled}
        onChange={(event) => setSelected(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <SaveButton dirty={dirty} disabled={disabled} onClick={() => onSave(selected)} />
    </FieldRow>
  );
}

function StringListInput({
  value,
  disabled,
  onSave,
}: {
  value: string[];
  disabled: boolean;
  onSave: (value: string[]) => void;
}) {
  const initial = value.join(', ');
  const [text, setText] = useState(initial);
  const dirty = text !== initial;

  return (
    <FieldRow>
      <Input
        className="w-80"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
      />
      <SaveButton
        dirty={dirty}
        disabled={disabled}
        onClick={() =>
          onSave(
            text
              .split(',')
              .map((item) => item.trim())
              .filter((item) => item.length > 0),
          )
        }
      />
    </FieldRow>
  );
}

function JsonInput({
  value,
  disabled,
  onSave,
}: {
  value: unknown;
  disabled: boolean;
  onSave: (value: unknown) => void;
}) {
  const { t } = useTranslation('settings');
  const initial = JSON.stringify(value);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = text !== initial;

  return (
    <FieldRow>
      <Input
        className="w-80"
        value={text}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
      />
      {error && <p className="text-xs text-destructive">{t('settings:errors.invalidJson')}</p>}
      <SaveButton
        dirty={dirty}
        disabled={disabled}
        onClick={() => {
          try {
            onSave(JSON.parse(text));
          } catch {
            setError('invalid');
          }
        }}
      />
    </FieldRow>
  );
}
