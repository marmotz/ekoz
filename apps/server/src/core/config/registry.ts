import { type ZodType, z } from 'zod';
import { isValidServerDomain } from '../discovery/server-domain.js';

/** `infra` resolves from file + env only; `runtime` also reads the settings table. */
export type ParameterKind = 'infra' | 'runtime';

export interface ParameterSpec {
  readonly kind: ParameterKind;
  /** Zod schema for the resolved value. Also used to coerce file / env inputs. */
  readonly schema: ZodType;
  /** Code default. `undefined` means the parameter is required (infra) or has no fallback. */
  readonly default?: unknown;
  /** A `runtime` change takes effect without a restart when `true`. */
  readonly hotReloadable: boolean;
  /** Value is a secret: never logged, masked in `describe()` for the admin UI. */
  readonly secret: boolean;
  /** `true` = a comma-separated string from env is split into a list before parsing. */
  readonly list?: boolean;
}

const fqdn = z
  .string()
  .toLowerCase()
  .refine(isValidServerDomain, { message: 'must be a public FQDN (not localhost or an IP)' });

const url = z.url();
const port = z.coerce.number().int().min(1).max(65535);
const bool = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
const int = z.coerce.number().int();
const ratio = z.coerce.number().min(0).max(1);

/** Unit multipliers for the compact duration form (`15m`, `30d`, `2h`, `45s`). */
const DURATION_UNIT_SECONDS: Record<'s' | 'm' | 'h' | 'd', number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
};

/**
 * A duration, resolved to a whole number of seconds. Accepts the compact
 * `<n><unit>` string (`s` / `m` / `h` / `d`, e.g. `15m`) or a bare number of
 * seconds (string or number, from env / file).
 */
const durationSeconds = z
  .union([z.number().int().min(0), z.string().trim().min(1)])
  .transform((value, ctx) => {
    if (typeof value === 'number') return value;
    if (/^\d+$/.test(value)) return Number(value);

    const match = /^(\d+)\s*([smhd])$/.exec(value);
    if (!match) {
      ctx.addIssue({
        code: 'custom',
        message: 'must be a duration like "15m", "30d" or a number of seconds',
      });
      return z.NEVER;
    }

    const unit = match[2] as keyof typeof DURATION_UNIT_SECONDS;
    return Number(match[1]) * DURATION_UNIT_SECONDS[unit];
  });

/**
 * The single typed parameter registry (ADR 0009, technical.md §2). Only
 * server-core parameters live here; each feature adds its own on its own task.
 */
export const PARAMETER_REGISTRY = {
  'server.domain': { kind: 'infra', schema: fqdn, hotReloadable: false, secret: false },
  'server.api_url': { kind: 'infra', schema: url, hotReloadable: false, secret: false },
  'server.web_url': { kind: 'infra', schema: url, hotReloadable: false, secret: false },
  'http.host': {
    kind: 'infra',
    schema: z.string().min(1),
    default: '0.0.0.0',
    hotReloadable: false,
    secret: false,
  },
  'http.port': { kind: 'infra', schema: port, default: 3010, hotReloadable: false, secret: false },
  'http.cors_allowed_origins': {
    kind: 'infra',
    schema: z.array(z.url()).default([]),
    default: [],
    hotReloadable: false,
    secret: false,
    list: true,
  },
  'database.url': { kind: 'infra', schema: z.string().min(1), hotReloadable: false, secret: true },
  'secret.key': {
    kind: 'infra',
    schema: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'must be 32 bytes, base64',
    }),
    hotReloadable: false,
    secret: true,
  },
  'storage.driver': {
    kind: 'infra',
    schema: z.enum(['local', 's3']),
    default: 'local',
    hotReloadable: false,
    secret: false,
  },
  'storage.local.path': {
    kind: 'infra',
    schema: z.string().min(1),
    default: './var/blobs',
    hotReloadable: false,
    secret: false,
  },
  'storage.gc_grace_seconds': {
    kind: 'infra',
    schema: int.pipe(z.number().min(0)),
    default: 3600,
    hotReloadable: false,
    secret: false,
  },
  'storage.s3.endpoint': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'storage.s3.region': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'storage.s3.bucket': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'storage.s3.access_key_id': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'storage.s3.secret_access_key': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'email.driver': {
    kind: 'infra',
    schema: z.enum(['smtp']),
    default: 'smtp',
    hotReloadable: false,
    secret: false,
  },
  'email.smtp.host': {
    kind: 'infra',
    schema: z.string().min(1),
    default: 'localhost',
    hotReloadable: false,
    secret: true,
  },
  'email.smtp.port': {
    kind: 'infra',
    schema: port,
    default: 1025,
    hotReloadable: false,
    secret: true,
  },
  'email.smtp.secure': {
    kind: 'infra',
    schema: bool,
    default: false,
    hotReloadable: false,
    secret: true,
  },
  'email.smtp.user': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'email.smtp.pass': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'email.retry_base_ms': {
    kind: 'infra',
    schema: int.pipe(z.number().min(0)),
    default: 2000,
    hotReloadable: false,
    secret: false,
  },
  'email.from': {
    kind: 'infra',
    schema: z.string().min(1),
    default: 'Ekoz <no-reply@localhost>',
    hotReloadable: false,
    secret: false,
  },
  'registration.mode': {
    kind: 'runtime',
    schema: z.enum(['open', 'invite', 'admin']),
    default: 'invite',
    hotReloadable: true,
    secret: false,
  },
  'email.verification_required': {
    kind: 'runtime',
    schema: bool,
    default: true,
    hotReloadable: true,
    secret: false,
  },
  'email.verification_ttl': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '24h',
    hotReloadable: true,
    secret: false,
  },
  'invitation.ttl': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '7d',
    hotReloadable: true,
    secret: false,
  },
  'identity.username_change_policy': {
    kind: 'runtime',
    schema: z.enum(['immutable', 'available', 'approval']),
    default: 'immutable',
    hotReloadable: true,
    secret: false,
  },
  'identity.reserved_usernames': {
    kind: 'runtime',
    schema: z.array(z.string()).default([]),
    default: [],
    hotReloadable: true,
    secret: false,
    list: true,
  },
  'identity.username_release_delay': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '30d',
    hotReloadable: true,
    secret: false,
  },
  'identity.username_change_cooldown': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '30d',
    hotReloadable: true,
    secret: false,
  },
  'auth.access_token_ttl': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '15m',
    hotReloadable: true,
    secret: false,
  },
  'auth.refresh_token_ttl': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '30d',
    hotReloadable: true,
    secret: false,
  },
  'auth.max_sessions_per_user': {
    kind: 'runtime',
    schema: int.pipe(z.number().min(1)),
    default: 20,
    hotReloadable: true,
    secret: false,
  },
  'auth.password_reset_ttl': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '1h',
    hotReloadable: true,
    secret: false,
  },
  'auth.stream_ticket_ttl': {
    kind: 'runtime',
    schema: durationSeconds,
    default: '30s',
    hotReloadable: true,
    secret: false,
  },
  'auth.sensitive_throttle': {
    kind: 'runtime',
    // Accepts the resolved object, or a JSON string from an env override.
    schema: z
      .union([z.string().transform((s) => JSON.parse(s) as unknown), z.object({}).passthrough()])
      .pipe(z.object({ window: durationSeconds, max: int.pipe(z.number().min(1)) })),
    default: { window: '15m', max: 10 },
    hotReloadable: true,
    secret: false,
  },
  'profile.bio_max_length': {
    kind: 'runtime',
    schema: int.pipe(z.number().min(0)),
    default: 500,
    hotReloadable: true,
    secret: false,
  },
  'avatar.max_size_bytes': {
    kind: 'runtime',
    schema: int.pipe(z.number().min(0)),
    default: 2_000_000,
    hotReloadable: true,
    secret: false,
  },
  'avatar.allowed_mime': {
    kind: 'runtime',
    schema: z.array(z.string()).min(1),
    default: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    hotReloadable: true,
    secret: false,
    list: true,
  },
  'observability.log_level': {
    kind: 'runtime',
    schema: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
    default: 'info',
    hotReloadable: true,
    secret: false,
  },
  'observability.log_format': {
    kind: 'infra',
    schema: z.enum(['json', 'pretty']),
    default: 'json',
    hotReloadable: false,
    secret: false,
  },
  'observability.metrics_enabled': {
    kind: 'runtime',
    schema: bool,
    default: false,
    hotReloadable: true,
    secret: false,
  },
  'observability.metrics_token': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: true,
  },
  'observability.otlp_endpoint': {
    kind: 'infra',
    schema: z.string().optional(),
    hotReloadable: false,
    secret: false,
  },
  'observability.trace_sample_ratio': {
    kind: 'runtime',
    schema: ratio,
    default: 0,
    hotReloadable: true,
    secret: false,
  },
  'signing.key_overlap_seconds': {
    kind: 'infra',
    schema: int.pipe(z.number().min(0)),
    default: 604_800,
    hotReloadable: false,
    secret: false,
  },
} as const satisfies Record<string, ParameterSpec>;

export type ParameterKey = keyof typeof PARAMETER_REGISTRY;

export type ParameterValue<K extends ParameterKey> = z.infer<
  (typeof PARAMETER_REGISTRY)[K]['schema']
>;

export function isParameterKey(key: string): key is ParameterKey {
  return key in PARAMETER_REGISTRY;
}

export function parameterSpec<K extends ParameterKey>(key: K): (typeof PARAMETER_REGISTRY)[K] {
  return PARAMETER_REGISTRY[key];
}

export const RUNTIME_KEYS: ParameterKey[] = (
  Object.keys(PARAMETER_REGISTRY) as ParameterKey[]
).filter((k) => PARAMETER_REGISTRY[k].kind === 'runtime');
export const INFRA_KEYS: ParameterKey[] = (
  Object.keys(PARAMETER_REGISTRY) as ParameterKey[]
).filter((k) => PARAMETER_REGISTRY[k].kind === 'infra');
