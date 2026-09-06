import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { readEnvOverrides } from './env-overrides.js';
import {
  INFRA_KEYS,
  PARAMETER_REGISTRY,
  type ParameterKey,
  type ParameterSpec,
  type ParameterValue,
} from './registry.js';
import { SettingsRepository } from './settings.repository.js';
import { type FlatConfig, loadTomlConfig } from './toml-loader.js';

/** The registry entry for `key`, widened to the common `ParameterSpec` shape. */
function specOf(key: ParameterKey): ParameterSpec {
  return PARAMETER_REGISTRY[key] as ParameterSpec;
}

export type ConfigSource = 'default' | 'file' | 'settings' | 'env';

/** Placeholder shown instead of a secret value in `describe()`. */
export const SECRET_MASK = '[secret]';

export interface ConfigDescription<K extends ParameterKey = ParameterKey> {
  /** The resolved value, or `SECRET_MASK` when the parameter is a secret. */
  value: ParameterValue<K> | typeof SECRET_MASK;
  source: ConfigSource;
  /** `true` when an env override pins the value (admin sees it read-only). */
  locked: boolean;
  hotReloadable: boolean;
  /** `true` for secret-bearing parameters; their value is masked here. */
  secret: boolean;
}

/** Hot-reloadable runtime keys re-read the settings table at most this often. */
const HOT_RELOAD_TTL_MS = 5_000;

/**
 * Layered configuration resolver (ADR 0009, technical.md §2):
 * `code defaults < TOML file < settings table (admin) < environment`.
 *
 * `infra` keys never read the settings table. An env override on a `runtime`
 * key also *locks* it. Boot aborts on any missing / invalid `infra` parameter.
 */
@Injectable()
export class ConfigService implements OnModuleInit {
  private readonly logger = new Logger(ConfigService.name);
  private toml: FlatConfig = new Map();
  private envOverrides = new Map<ParameterKey, string>();
  private settings = new Map<ParameterKey, unknown>();
  private settingsLoadedAt = 0;

  constructor(
    private readonly settingsRepo: SettingsRepository | null = null,
    private readonly options: { tomlPath?: string; env?: NodeJS.ProcessEnv } = {},
  ) {}

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  /** Load file + env, refresh the settings cache, and validate every infra key. */
  async init(): Promise<void> {
    const env = this.options.env ?? process.env;
    const tomlPath = this.options.tomlPath ?? env.EKOZ_CONFIG_FILE ?? './config.toml';
    this.toml = loadTomlConfig(tomlPath, env);
    this.envOverrides = readEnvOverrides(env);
    await this.refreshSettings(true);

    const failures: string[] = [];
    for (const key of INFRA_KEYS) {
      try {
        this.get(key);
      } catch (error) {
        failures.push(`  - ${key}: ${(error as Error).message}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Invalid or missing infra configuration:\n${failures.join('\n')}`);
    }

    this.logger.log('Configuration loaded and infra parameters validated');
  }

  /** Resolved, validated value for `key`. Returns the real secret value. */
  get<K extends ParameterKey>(key: K): ParameterValue<K> {
    return this.resolve(key).value as ParameterValue<K>;
  }

  /**
   * Resolution detail for the admin UI. Secret parameters report `secret: true`
   * and their `value` is replaced by `SECRET_MASK` (technical.md §2).
   */
  describe<K extends ParameterKey>(key: K): ConfigDescription<K> {
    const spec = specOf(key);
    const { value, source } = this.resolve(key);

    return {
      value: spec.secret ? SECRET_MASK : (value as ParameterValue<K>),
      source,
      locked: source === 'env' && spec.kind === 'runtime',
      hotReloadable: spec.hotReloadable,
      secret: spec.secret,
    };
  }

  private resolve(key: ParameterKey): { value: unknown; source: ConfigSource } {
    const spec = specOf(key);
    this.maybeExpireSettings();

    let raw: unknown;
    let source: ConfigSource;

    if (this.envOverrides.has(key)) {
      raw = this.envOverrides.get(key);
      source = 'env';
    } else if (spec.kind === 'runtime' && this.settings.has(key)) {
      raw = this.settings.get(key);
      source = 'settings';
    } else if (this.toml.has(key)) {
      raw = this.toml.get(key);
      source = 'file';
    } else {
      raw = spec.default;
      source = 'default';
    }

    return { value: this.coerce(key, raw, source), source };
  }

  /** Write a runtime override, then invalidate the cache so `get()` sees it. */
  async set(key: string, value: unknown, updatedBy: string | null): Promise<void> {
    if (!this.settingsRepo) {
      throw new Error('ConfigService has no settings repository (runtime overrides unavailable)');
    }

    await this.settingsRepo.set(key, value, updatedBy);
    await this.refreshSettings(true);
  }

  /** Drop a runtime override. */
  async clear(key: string): Promise<void> {
    if (!this.settingsRepo) {
      return;
    }

    await this.settingsRepo.clear(key);
    await this.refreshSettings(true);
  }

  /** Force the next `get()` of a hot-reloadable key to re-read the settings table. */
  invalidate(): void {
    this.settingsLoadedAt = 0;
  }

  private async refreshSettings(force: boolean): Promise<void> {
    if (!this.settingsRepo) {
      return;
    }

    if (!force && Date.now() - this.settingsLoadedAt < HOT_RELOAD_TTL_MS) {
      return;
    }

    this.settings = await this.settingsRepo.loadAll();
    this.settingsLoadedAt = Date.now();
  }

  private maybeExpireSettings(): void {
    if (this.settingsRepo && Date.now() - this.settingsLoadedAt >= HOT_RELOAD_TTL_MS) {
      // Fire and forget: the reload is cheap and the stale value is served until
      // it resolves. Bootstrap always primes synchronously via `init()`.
      void this.refreshSettings(false);
    }
  }

  private coerce(key: ParameterKey, raw: unknown, source: ConfigSource): unknown {
    const spec = specOf(key);
    if (raw === undefined) {
      const optional = spec.schema.safeParse(undefined);
      if (optional.success) {
        return optional.data;
      }

      throw new Error('required parameter is not set');
    }

    let candidate = raw;
    if (source === 'env' && spec.list && typeof raw === 'string') {
      candidate = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const parsed = spec.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'failed validation');
    }

    return parsed.data;
  }
}
