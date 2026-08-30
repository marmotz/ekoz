import { z, type ZodType } from 'zod';
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

/**
 * The single typed parameter registry (ADR 0009, technical.md §2). Only
 * server-core parameters live here; each feature adds its own on its own task.
 */
export const PARAMETER_REGISTRY = {
  'server.domain': { kind: 'infra', schema: fqdn, hotReloadable: false, secret: false },
  'server.api_url': { kind: 'infra', schema: url, hotReloadable: false, secret: false },
  'server.web_url': { kind: 'infra', schema: url, hotReloadable: false, secret: false },
  'http.host': { kind: 'infra', schema: z.string().min(1), default: '0.0.0.0', hotReloadable: false, secret: false },
  'http.port': { kind: 'infra', schema: port, default: 3000, hotReloadable: false, secret: false },
  'database.url': { kind: 'infra', schema: z.string().min(1), hotReloadable: false, secret: true },
  'secret.key': {
    kind: 'infra',
    schema: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, { message: 'must be 32 bytes, base64' }),
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
  'storage.s3.endpoint': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
  'storage.s3.region': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
  'storage.s3.bucket': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
  'storage.s3.access_key_id': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
  'storage.s3.secret_access_key': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
  'email.driver': { kind: 'infra', schema: z.enum(['smtp']), default: 'smtp', hotReloadable: false, secret: false },
  'email.smtp.host': {
    kind: 'infra',
    schema: z.string().min(1),
    default: 'localhost',
    hotReloadable: false,
    secret: true,
  },
  'email.smtp.port': { kind: 'infra', schema: port, default: 1025, hotReloadable: false, secret: true },
  'email.smtp.secure': { kind: 'infra', schema: bool, default: false, hotReloadable: false, secret: true },
  'email.smtp.user': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
  'email.smtp.pass': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
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
  'email.verification_required': { kind: 'runtime', schema: bool, default: true, hotReloadable: true, secret: false },
  'identity.username_change_policy': {
    kind: 'runtime',
    schema: z.enum(['immutable', 'available', 'approval']),
    default: 'immutable',
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
  'observability.metrics_token': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: true },
  'observability.otlp_endpoint': { kind: 'infra', schema: z.string().optional(), hotReloadable: false, secret: false },
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

export type ParameterValue<K extends ParameterKey> = z.infer<(typeof PARAMETER_REGISTRY)[K]['schema']>;

export function isParameterKey(key: string): key is ParameterKey {
  return key in PARAMETER_REGISTRY;
}

export function parameterSpec<K extends ParameterKey>(key: K): (typeof PARAMETER_REGISTRY)[K] {
  return PARAMETER_REGISTRY[key];
}

export const RUNTIME_KEYS: ParameterKey[] = (Object.keys(PARAMETER_REGISTRY) as ParameterKey[]).filter(
  (k) => PARAMETER_REGISTRY[k].kind === 'runtime'
);
export const INFRA_KEYS: ParameterKey[] = (Object.keys(PARAMETER_REGISTRY) as ParameterKey[]).filter(
  (k) => PARAMETER_REGISTRY[k].kind === 'infra'
);
